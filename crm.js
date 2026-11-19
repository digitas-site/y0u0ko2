"use strict";
(() => {
  const stages = [["初回接触",10],["ヒアリング",25],["提案・見積",50],["最終調整",75],["受注",100],["失注",0]];
  const leadStatuses=["未対応","対応中","商談化候補","対象外"];
  const forecastCategories=["案件","最善ケース","達成見込","受注"];
  const forecastDefaults=[0,0,1,2,3];
  const forecastFor=deal=>deal.stage>=4 ? forecastDefaults[deal.stage] : (deal.forecast ?? forecastDefaults[deal.stage]);
  const channels = ["電話","メール","訪問","オンライン商談","メモ"];
  const accountTypes = ["見込み","取引中","休眠"];
  const yen = new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY"});
  let tab = "overview";
  let filter = "";
  let companyDetail = "";
  let month = currentDay().slice(0,7);
  let forecastOwner="";
  const id = () => crypto.randomUUID();
  const find = (xs,key) => xs.find(item => item.id===key);
  const clean = value => String(value ?? "").trim();
  const keyOf = value => clean(value).normalize("NFKC").toLowerCase();
  const panel = (title) => { const node=el("section",undefined,"crm-panel"); node.append(el("h2",title)); return node; };
  const button = (label,action,primary=false) => {const node=el("button",label,primary?"primary":"");node.type="button";node.onclick=action;return node;};
  const actions = (...children) => {const node=el("div",undefined,"crm-actions");node.append(...children);return node;};
  const select = (options,value,label) => {
    const node=el("select");
    node.setAttribute("aria-label",label);
    node.append(...options.map(([key,text]) => { const option=el("option",text);option.value=key;return option; }));
    node.value=value;
    return node;
  };
  function data() {
    if (!board.crm) {
      board.crm={accounts:[],contacts:[],deals:[],activities:[],targets:{}};
      const sample = board.items.filter(item => /^sample-[0-7]$/.test(item.id) && item.company);
      const names = [...new Set(sample.map(item=>item.company))];
      for (const [index,name] of names.entries()) {
        const account={id:id(),name,type:index===0?"取引中":"見込み",owner:["佐藤","鈴木","田中"][index%3],memo:""};
        board.crm.accounts.push(account);
        const contact={id:id(),account:account.id,name:["山本","伊藤","中村"][index%3],title:"窓口担当",email:"",phone:""};
        board.crm.contacts.push(contact);
        const deal={id:id(),account:account.id,contact:contact.id,title:["サイト改善提案","業務効率化支援","新規企画の提案"][index%3],stage:[2,1,4][index%3],amount:[1200000,850000,600000][index%3],close:currentDay().slice(0,7)+"-"+String(index+12).padStart(2,"0"),owner:account.owner,next:index===2?"":"提案内容の確認",nextDate:index===2?"":shift(currentDay(),index),memo:""};
        board.crm.deals.push(deal);
        board.crm.activities.push({id:id(),account:account.id,deal:deal.id,date:shift(currentDay(),-index),type:channels[index],owner:deal.owner,note:"提案の前提と次回の確認事項を整理。"});
      }
    }
    for (const name of new Set(board.items.map(item=>item.company).filter(Boolean))) {
      if (!board.crm.accounts.some(account=>keyOf(account.name)===keyOf(name))) board.crm.accounts.push({id:id(),name,type:"見込み",owner:"",memo:""});
    }
    if (!board.crm.campaigns) {
      const campaign={id:id(),name:"オンライン相談会",type:"セミナー",date:currentDay(),cost:50000};
      board.crm.campaigns=[campaign];
      board.crm.leads=[
        {id:id(),company:"青葉デザイン株式会社",name:"佐々木",email:"",source:"セミナー",owner:"佐藤",status:"商談化候補",campaign:campaign.id,note:"サイト改善について相談。"},
        {id:id(),company:"リバーサイド企画株式会社",name:"高橋",email:"",source:"Web問い合わせ",owner:"鈴木",status:"未対応",campaign:"",note:"資料請求。"}
      ];
    }
    return board.crm;
  }
  const companyName = (d,key) => find(d.accounts,key)?.name ?? "企業名未設定";
  const closed = deal => deal.stage>=4;
  function save(message) {
    persist();
    renderCrm();
    $("crm-notice").textContent=message;
  }
  function showTab(next) {
    if (tab===next) return;
    tab=next;
    $("crm-notice").textContent="";
    renderCrm();
    revealContent($("crm-content"));
  }
  function list(items,make,empty) {
    const node=el("ul",undefined,"crm-list");
    if (!items.length) node.append(el("li",empty,"sub"));
    for (const item of items) {const row=el("li");row.append(...make(item));node.append(row);}
    return node;
  }
  function toolbar(title,...buttons) {
    const node=el("div",undefined,"crm-toolbar");
    node.append(el("h2",title),actions(...buttons));
    return node;
  }
  function editor(title,fields,submit) {
    const form=$("crm-form");
    const heading=el("h2",title);
    heading.id="crm-dialog-title";
    const controls={};
    form.replaceChildren(heading);
    for (const [key,label,value,kind,options] of fields) {
      const wrapper=el("label",label);
      const field=kind==="select" ? select(options,String(value??""),label) : el(kind==="textarea"?"textarea":"input");
      if (kind!=="select" && kind!=="textarea") field.type=kind==="optional"?"text":kind==="date-optional"?"date":kind;
      if (kind==="number") {field.min="0";field.max="1000000000000";field.step="1";}
      if (kind!=="select") field.value=value??"";
      if (["text","number","date"].includes(kind) || (kind==="select" && options[0][0]!=="")) field.required=true;
      field.name=key;
      controls[key]=field;
      wrapper.append(field);
      form.append(wrapper);
    }
    const error=el("p",undefined,"sub");
    error.setAttribute("role","status");
    const commit=el("button","保存","primary");
    commit.type="submit";
    form.append(error,actions(button("キャンセル",()=>$("crm-editor").close()),commit));
    form.onsubmit=event=>{
      event.preventDefault();
      try {
        submit(Object.fromEntries(Object.entries(controls).map(([key,field])=>[key,clean(field.value)])));
        $("crm-editor").close();
      } catch (issue) {error.textContent=issue.message;}
    };
    $("crm-editor").showModal();
  }
  function editAccount(d,account={}) {
    editor(account.id?"取引先を編集":"取引先を登録",[
      ["name","企業名",account.name,"text"],["type","顧客区分",account.type??"見込み","select",accountTypes.map(value=>[value,value])],
      ["owner","営業担当",account.owner,"optional"],["memo","企業メモ",account.memo,"textarea"]
    ],values=>{
      if (!values.name || d.accounts.some(item=>item.id!==account.id&&keyOf(item.name)===keyOf(values.name))) throw new Error("企業名を確認してください。同じ企業名は登録済みです。");
      if (account.id) {
        for (const item of board.items) if (keyOf(item.company)===keyOf(account.name)) item.company=values.name;
        Object.assign(account,values);
      } else { account={id:id(),...values}; d.accounts.push(account); }
      companyDetail=account.id;
      save("取引先を保存しました。");
    });
  }
  function editContact(d,account,contact={}) {
    editor(contact.id?"担当者を編集":"担当者を登録",[
      ["name","氏名",contact.name,"text"],["title","部署・役職",contact.title,"optional"],
      ["email","メール",contact.email,"email"],["phone","電話番号",contact.phone,"tel"]
    ],values=>{
      if (!values.name) throw new Error("担当者名を入力してください。");
      if (contact.id) Object.assign(contact,values);
      else d.contacts.push({id:id(),account:account.id,...values});
      save("担当者を保存しました。");
    });
  }
  function editDeal(d,deal={},accountKey=filter) {
    if (!d.accounts.length) {showTab("accounts");editAccount(d);return;}
    editor(deal.id?"商談を編集":"商談を登録",[
      ["account","取引先",(deal.account??accountKey)||d.accounts[0].id,"select",d.accounts.map(a=>[a.id,a.name])],
      ["contact","先方担当者（任意）",deal.contact??"","select",[["","指定なし"],...d.contacts.map(c=>[c.id,companyName(d,c.account)+" / "+c.name])]],
      ["title","商談名",deal.title,"text"],["stage","フェーズ",deal.stage??0,"select",stages.map(([name],index)=>[index,name])],
      ["amount","金額（円）",deal.amount??0,"number"],["close","受注予定日・確定日",deal.close??currentDay(),"date"],
      ["owner","営業担当",deal.owner,"optional"],
      ["forecast","売上予測区分",deal.forecast??"","select",[["","フェーズに連動"],...forecastCategories.slice(0,3).map((label,index)=>[index,label])]],["next","次のアクション",deal.next,"optional"],
      ["nextDate","次回対応日（任意）",deal.nextDate,"date-optional"],["memo","商談メモ",deal.memo,"textarea"]
    ],values=>{
      if (!values.title) throw new Error("商談名を入力してください。");
      if (values.contact && find(d.contacts,values.contact)?.account!==values.account) throw new Error("取引先と先方担当者の企業名を合わせてください。");
      if (deal.id && deal.account!==values.account && d.activities.some(item=>item.deal===deal.id)) throw new Error("活動履歴がある商談は取引先を固定しています。");
      values.stage=Number(values.stage);
      values.amount=Number(values.amount);
      values.forecast=values.forecast===""?null:Number(values.forecast);
      if (deal.id) Object.assign(deal,values);
      else d.deals.push({id:id(),...values});
      save("商談を保存しました。");
    });
  }
  function editActivity(d,activity={},deal={}) {
    if (!d.accounts.length) {showTab("accounts");editAccount(d);return;}
    editor(activity.id?"活動を編集":"活動を記録",[
      ["account","取引先",(activity.account??deal.account??filter)||d.accounts[0].id,"select",d.accounts.map(a=>[a.id,a.name])],
      ["deal","商談（任意）",activity.deal??deal.id??"","select",[["","指定なし"],...d.deals.map(x=>[x.id,companyName(d,x.account)+" / "+x.title])]],
      ["date","活動日",activity.date??currentDay(),"date"],["type","活動種別",activity.type??channels[0],"select",channels.map(x=>[x,x])],
      ["owner","営業担当",activity.owner??deal.owner,"optional"],["note","活動内容",activity.note,"textarea"]
    ],values=>{
      if (!values.note) throw new Error("活動内容を入力してください。");
      if (values.deal && find(d.deals,values.deal)?.account!==values.account) throw new Error("取引先と商談の企業名を合わせてください。");
      if (activity.id) Object.assign(activity,values);
      else d.activities.push({id:id(),...values});
      save("活動を保存しました。");
    });
  }
  function companyFilter(d) {
    const node=select([["","全取引先"],...d.accounts.map(a=>[a.id,a.name])],filter,"取引先を絞り込む");
    node.onchange=()=>{filter=node.value;renderCrm();};
    return node;
  }
  function report(d) {
    const section=el("div",undefined,"crm-stack");
    const period=el("input");period.type="month";period.value=month;period.setAttribute("aria-label","集計月");
    period.onchange=()=>{if(period.value){month=period.value;renderCrm();}};
    const deals=d.deals.filter(item=>item.close.startsWith(month));
    const won=deals.filter(x=>x.stage===4).reduce((total,x)=>total+x.amount,0);
    const forecast=deals.filter(x=>!closed(x)).reduce((total,x)=>total+x.amount*stages[x.stage][1]/100,0);
    const target=d.targets[month]??0;
    const events=d.activities.filter(a=>a.date.startsWith(month));
    section.append(toolbar("月次の営業状況",period,button("月次目標を設定",()=>editor("月次目標 "+month,[["amount","売上目標（円）",target,"number"]],values=>{d.targets[month]=Number(values.amount);save("目標を保存しました。");}))));
    const kpis=el("div",undefined,"crm-kpis");
    for (const [label,value] of [["受注実績",yen.format(won)],["受注見込み（確度加重）",yen.format(Math.round(forecast))],["目標達成率",target?Math.round(won/target*100)+"%":"目標未設定"],["活動件数",events.length+"件"]]) {
      const card=el("div",label,"crm-panel");
      card.append(el("strong",value));kpis.append(card);
    }
    const split=el("div",undefined,"crm-split");
    for (const [heading,values] of [["フェーズ別の商談",stages.map(([label],index)=>[label,deals.filter(x=>x.stage===index).length])],["担当者別の活動",Object.entries(events.reduce((acc,x)=>{const name=x.owner||"未割当";acc[name]=(acc[name]??0)+1;return acc;},Object.create(null))) ]]) {
      const chart=panel(heading);
      const max=Math.max(1,...values.map(([,n])=>n));
      chart.append(list(values,([label,count])=>{
        const strip=el("div",undefined,"crm-strip");const fill=el("i");fill.style.width=count/max*100+"%";strip.append(fill);
        return [el("span",label+"　"+count+"件"),strip];
      },"集計対象がありません。"));
      split.append(chart);
    }
    const next=panel("次回対応");
    const pending=d.deals.filter(x=>!closed(x) && x.nextDate).sort((a,b)=>a.nextDate.localeCompare(b.nextDate));
    next.append(list(pending,deal=>[button(deal.nextDate+"　"+companyName(d,deal.account)+" / "+deal.title,()=>editDeal(d,deal)),el("p",deal.next+(deal.nextDate<currentDay()?"（期限超過）":""),"sub")],"次回対応日は未設定です。"));
    section.append(kpis,split,next);
    return section;
  }
  function accounts(d) {
    const section=el("div",undefined,"crm-stack");
    section.append(toolbar("取引先・担当者",button("＋ 取引先",()=>editAccount(d),true)));
    const query=el("input");query.type="search";query.placeholder="企業名・担当者を検索";query.setAttribute("aria-label","取引先検索");
    const output=el("div",undefined,"crm-stack");
    const populate=()=>{
      output.replaceChildren();
      for (const account of d.accounts.filter(a=>keyOf(a.name+" "+a.owner+" "+d.contacts.filter(c=>c.account===a.id).map(c=>c.name).join(" ")).includes(keyOf(query.value)))) {
        const details=el("details",undefined,"crm-panel");
        details.open=companyDetail===account.id;
        details.ontoggle=()=>{if(details.open) companyDetail=account.id;};
        const contacts=d.contacts.filter(c=>c.account===account.id);
        const deals=d.deals.filter(x=>x.account===account.id);
        const cases=board.items.filter(item=>keyOf(item.company)===keyOf(account.name));
        details.append(el("summary",account.name+"　"+account.type+"　商談 "+deals.length+"件　案件 "+cases.length+"件"),el("p",[account.owner&&"営業担当 "+account.owner,account.memo].filter(Boolean).join("　"),"sub"));
        details.append(actions(button("取引先を編集",()=>editAccount(d,account)),button("担当者を追加",()=>editContact(d,account)),button("商談を追加",()=>editDeal(d,{},account.id))));
        details.append(list(contacts,contact=>[button(contact.name,()=>editContact(d,account,contact)),el("p",[contact.title,contact.email,contact.phone].filter(Boolean).join("　"),"sub")],"担当者は未登録です。"));
        details.append(list(deals,deal=>[button(deal.title,()=>editDeal(d,deal)),el("span","　"+stages[deal.stage][0],"sub")],"商談は未登録です。"));
        if (cases.length) details.append(list(cases,item=>[button("案件　"+item.name,()=>openEditor(item))],""));
        output.append(details);
      }
      if (!output.children.length) output.append(el("p","該当する取引先はありません。","sub"));
    };
    query.oninput=populate;populate();section.append(query,output);
    return section;
  }
  function deals(d) {
    const section=el("div",undefined,"crm-stack");
    section.append(toolbar("商談ボード",companyFilter(d),button("＋ 商談",()=>editDeal(d),true)));
    const pipeline=el("div",undefined,"crm-pipeline");
    for (const [stage,[label,probability]] of stages.entries()) {
      const column=el("section",undefined,"crm-lane");
      const matching=d.deals.filter(x=>x.stage===stage&&(!filter||x.account===filter));
      column.append(el("h3",label+"　"+matching.length+"件"));
      if (stage<4) column.append(el("p","確度 "+probability+"%","sub"));
      for (const deal of matching) {
        const card=el("div",undefined,"crm-card");
        const phase=select(stages.map(([name],index)=>[index,name]),String(stage),deal.title+"のフェーズ");
        phase.onchange=()=>{deal.stage=Number(phase.value);save("フェーズを更新しました。");};
        card.append(el("span",companyName(d,deal.account),"sub"),button(deal.title,()=>editDeal(d,deal)),el("strong",yen.format(deal.amount),"crm-amount"),
          el("span",deal.close+"　"+(deal.owner||"担当未割当"),"sub"),phase,button("活動を記録",()=>editActivity(d,{},deal)));
        column.append(card);
      }
      pipeline.append(column);
    }
    section.append(pipeline);
    return section;
  }
  function activities(d) {
    const section=panel("活動履歴");
    section.append(actions(companyFilter(d),button("＋ 活動を記録",()=>editActivity(d),true)));
    const matching=d.activities.filter(x=>!filter||x.account===filter).sort((a,b)=>b.date.localeCompare(a.date));
    section.append(list(matching,a=>[
      button(a.date+"　"+a.type+"　"+companyName(d,a.account),()=>editActivity(d,a)),
      el("p",[find(d.deals,a.deal)?.title,a.owner,a.note].filter(Boolean).join("　"),"sub")
    ],"活動履歴はありません。"));
    return section;
  }
  const headers=["企業名","商談名","フェーズ","金額","受注予定日","営業担当","次のアクション","次回対応日","メモ"];
  function csvRows(text) {
    const rows=[];let row=[];let value="";let quoted=false;let afterQuote=false;
    const input=text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");
    function cell(){row.push(value);value="";afterQuote=false;}
    function line(){cell();if(row.some(entry=>entry.trim()))rows.push(row);row=[];}
    for (let index=0;index<input.length;index++) {
      const char=input[index];
      if (quoted) {
        if (char==='"' && input[index+1]==='"') {value+='"';index++;}
        else if (char==='"') {quoted=false;afterQuote=true;}
        else value+=char;
      } else if (char===",") cell();
      else if (char==="\n") line();
      else if (char==='"' && !value && !afterQuote) quoted=true;
      else if (afterQuote || char==='"') throw new Error("CSVの引用符を確認してください。");
      else value+=char;
    }
    if(quoted) throw new Error("CSVの引用符が閉じていません。");
    line();
    return rows;
  }
  function csvDownload(file,rows) {
    const csv=rows.map(row=>row.map(value=>{
      const text=String(value??"");
      const safe=/^[\s]*[=+\-@]/.test(text)?"'"+text:text;
      return '"'+safe.replaceAll('"','""')+'"';
    }).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
    const link=el("a");link.href=url;link.download=file;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function importDeals(d,text) {
    const [head,...rows]=csvRows(text);
    if (!head || headers.slice(0,5).some(label=>!head.includes(label))) throw new Error("ひな形の先頭5列が必要です。");
    if (!rows.length) throw new Error("取り込む商談行を入力してください。");
    const companies=d.accounts.slice();
    const existing=new Set(d.deals.map(x=>x.account+"\0"+keyOf(x.title)));
    const incoming=[];
    const dateOk=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
    for (const [index,row] of rows.entries()) {
      const get=label=>clean(row[head.indexOf(label)]);
      const company=get("企業名"),title=get("商談名"),stage=stages.findIndex(([label])=>label===get("フェーズ"));
      const raw=get("金額"),amount=Number(raw),close=get("受注予定日"),nextDate=get("次回対応日");
      if (!company || !title || stage<0 || !/^\d+$/.test(raw) || !Number.isSafeInteger(amount) || amount>1e12 || !dateOk(close) || (nextDate&&!dateOk(nextDate))) throw new Error((index+2)+"行目の企業名・商談名・フェーズ・金額・日付を確認してください。");
      let account=companies.find(value=>keyOf(value.name)===keyOf(company));
      if (!account) {account={id:id(),name:company,type:"見込み",owner:"",memo:""};companies.push(account);}
      const signature=account.id+"\0"+keyOf(title);
      if (existing.has(signature)) throw new Error((index+2)+"行目に同じ企業・商談名が存在します。既存データは商談ボードから編集できます。");
      existing.add(signature);
      incoming.push({id:id(),account:account.id,contact:"",title,stage,amount,close,owner:get("営業担当"),next:get("次のアクション"),nextDate,memo:get("メモ")});
    }
    d.accounts=companies;
    d.deals.push(...incoming);
    return incoming.length;
  }
  function transfer(d) {
    const section=panel("商談CSVの入出力");
    const template=[headers,["サンプル株式会社","サンプル商談","提案・見積",500000,currentDay(),"佐藤","見積送付",currentDay(),"初回提案"]];
    section.append(el("p","ひな形に合わせたUTF-8のCSVを取り込めます。同じ企業の商談は既存の取引先に紐づけます。","sub"));
    section.append(actions(button("CSVひな形",()=>csvDownload("商談-ひな形.csv",template)),
      button("商談CSVを出力",()=>csvDownload("商談.csv",[headers,...d.deals.map(x=>[companyName(d,x.account),x.title,stages[x.stage][0],x.amount,x.close,x.owner,x.next,x.nextDate,x.memo])])),
      button("取引先・担当者CSVを出力",()=>csvDownload("取引先と担当者.csv",[["企業名","顧客区分","営業担当","氏名","部署・役職","メール","電話番号"],...d.accounts.flatMap(account=>{
        const contacts=d.contacts.filter(c=>c.account===account.id);
        return (contacts.length?contacts:[{}]).map(x=>[account.name,account.type,account.owner,x.name,x.title,x.email,x.phone]);
      })])),
      button("活動CSVを出力",()=>csvDownload("活動履歴.csv",[["活動日","企業名","商談名","活動種別","営業担当","活動内容"],...d.activities.map(a=>[a.date,companyName(d,a.account),find(d.deals,a.deal)?.title,a.type,a.owner,a.note])]))));
    const picker=el("input");picker.type="file";picker.accept=".csv,text/csv";picker.setAttribute("aria-label","取り込む商談CSV");
    const status=el("p",undefined,"sub");status.setAttribute("role","status");
    const upload=button("商談CSVを取り込む",async()=>{
      const file=picker.files[0];
      if (!file || file.size>2e6) {status.textContent="2 MB以下のCSVを1つ選んでください。";return;}
      upload.disabled=true;
      try {
        const text=await file.text();
        const count=importDeals(data(),text);
        save(count+"件の商談を取り込みました。");
      } catch(error) {status.textContent=error.message;upload.disabled=false;}
    },true);
    section.append(actions(picker,upload),status);
    return section;
  }
  function editLead(d,lead={}) {
    if (lead.converted) return;
    editor(lead.id?"リードを編集":"リードを登録",[
      ["company","企業名",lead.company,"text"],["name","氏名",lead.name,"text"],
      ["email","メール",lead.email,"email"],["source","流入元",lead.source,"optional"],
      ["campaign","キャンペーン",lead.campaign??"","select",[["","指定なし"],...d.campaigns.map(c=>[c.id,c.name])]],
      ["owner","営業担当",lead.owner,"optional"],["status","対応状況",lead.status??leadStatuses[0],"select",leadStatuses.map(x=>[x,x])],
      ["note","メモ",lead.note,"textarea"]
    ],values=>{
      if (!values.name||!values.company) throw new Error("企業名と氏名を入力してください。");
      if (values.email && d.leads.some(x=>x.id!==lead.id && keyOf(x.email)===keyOf(values.email))) throw new Error("同じメールアドレスのリードが登録されています。");
      if (lead.id) Object.assign(lead,values);
      else d.leads.push({id:id(),...values});
      save("リードを保存しました。");
    });
  }
  function convertLead(d,lead) {
    editor("リードを取引開始",[
      ["title","商談名",lead.company+"へのご提案","text"],
      ["amount","商談金額（円）",0,"number"],
      ["close","受注予定日",shift(currentDay(),14),"date"]
    ],values=>{
      if (!values.title) throw new Error("商談名を入力してください。");
      if (lead.converted) throw new Error("このリードは取引開始済みです。");
      const existing=d.accounts.find(x=>keyOf(x.name)===keyOf(lead.company));
      if (existing && d.deals.some(x=>x.account===existing.id&&keyOf(x.title)===keyOf(values.title))) throw new Error("同じ企業に同名の商談があります。商談名を変更してください。");
      const account=existing??{id:id(),name:lead.company,type:"見込み",owner:lead.owner,memo:""};
      const known=d.contacts.find(x=>x.account===account.id && (lead.email?keyOf(x.email)===keyOf(lead.email):keyOf(x.name)===keyOf(lead.name)));
      const contact=known??{id:id(),account:account.id,name:lead.name,email:lead.email,title:"",phone:""};
      const deal={id:id(),account:account.id,contact:contact.id,title:values.title,amount:Number(values.amount),close:values.close,stage:0,
        owner:lead.owner,next:"",nextDate:"",memo:lead.note,campaign:lead.campaign};
      if (!existing) d.accounts.push(account);
      if (!known) d.contacts.push(contact);
      d.deals.push(deal);
      lead.converted={account:account.id,contact:contact.id,deal:deal.id,date:currentDay()};
      save("リードから取引先・担当者・商談を紐づけました。");
    });
  }
  function leads(d) {
    const section=el("div",undefined,"crm-stack");
    section.append(toolbar("リード",button("＋ リード",()=>editLead(d),true)));
    const query=el("input");query.type="search";query.placeholder="企業名・氏名・流入元";query.setAttribute("aria-label","リードを検索");
    const status=select([["","すべて"],...leadStatuses.map(x=>[x,x]),["converted","取引開始済み"]],"","対応状況で絞り込む");
    const box=panel("見込み顧客");
    const results=el("div");
    const update=()=>{
      const matching=d.leads.filter(x=>(!status.value||(x.converted?"converted":x.status)===status.value)&&keyOf([x.company,x.name,x.source].join(" ")).includes(keyOf(query.value)));
      results.replaceChildren(list(matching,lead=>{
        const campaign=find(d.campaigns,lead.campaign);
        const info=[lead.converted?"取引開始済み":lead.status,lead.source,lead.owner,campaign?.name].filter(Boolean).join("　");
        const deal=find(d.deals,lead.converted?.deal);
        return [el("strong",lead.company+" / "+lead.name),el("p",info,"sub"),lead.converted
          ? actions(...(deal?[button("関連商談を開く",()=>editDeal(d,deal))]:[]))
          : actions(button("編集",()=>editLead(d,lead)),button("取引開始",()=>convertLead(d,lead),true))];
      },"該当するリードはありません。"));
    };
    status.onchange=update;query.oninput=update;update();
    box.append(actions(query,status),results);section.append(box);
    return section;
  }
  function editCampaign(d,campaign={}) {
    editor(campaign.id?"キャンペーンを編集":"キャンペーンを登録",[
      ["name","施策名",campaign.name,"text"],["type","施策種別",campaign.type,"optional"],
      ["date","実施日",campaign.date??currentDay(),"date"],["cost","費用（円）",campaign.cost??0,"number"]
    ],values=>{
      if (!values.name) throw new Error("施策名を入力してください。");
      values.cost=Number(values.cost);
      if (campaign.id) Object.assign(campaign,values);
      else d.campaigns.push({id:id(),...values});
      save("キャンペーンを保存しました。");
    });
  }
  function campaigns(d) {
    const section=el("div",undefined,"crm-stack");
    section.append(toolbar("キャンペーン",button("＋ キャンペーン",()=>editCampaign(d),true)));
    for (const campaign of d.campaigns) {
      const box=panel(campaign.name);
      const members=d.leads.filter(x=>x.campaign===campaign.id);
      const linked=d.deals.filter(x=>x.campaign===campaign.id);
      const won=linked.filter(x=>x.stage===4);
      box.append(el("p",[campaign.date,campaign.type,"費用 "+yen.format(campaign.cost)].filter(Boolean).join("　"),"sub"));
      box.append(el("p","リード "+members.length+"件　商談 "+linked.length+"件　受注 "+won.length+"件　受注額 "+yen.format(won.reduce((sum,x)=>sum+x.amount,0))));
      box.append(actions(button("施策を編集",()=>editCampaign(d,campaign)),button("リードを追加",()=>editLead(d,{campaign:campaign.id}))));
      box.append(list(members,x=>[el("span",x.company+" / "+x.name),el("span","　"+(x.converted?"取引開始済み":x.status),"sub")],"紐づくリードはありません。"));
      section.append(box);
    }
    if (!d.campaigns.length) section.append(el("p","キャンペーンは未登録です。","sub"));
    return section;
  }
  function forecast(d) {
    const section=el("div",undefined,"crm-stack");
    const period=el("input");period.type="month";period.value=month;period.setAttribute("aria-label","予測の集計月");
    period.onchange=()=>{if(period.value){month=period.value;renderCrm();}};
    const owners=[...new Set(d.deals.map(x=>x.owner).filter(Boolean))].sort();
    const owner=select([["","全営業担当"],...owners.map(x=>[x,x])],forecastOwner,"営業担当で絞り込む");
    owner.onchange=()=>{forecastOwner=owner.value;renderCrm();};
    const matching=d.deals.filter(x=>x.close.startsWith(month)&&(!forecastOwner||x.owner===forecastOwner)&&x.stage!==5);
    section.append(toolbar("月次の売上予測",period,owner),el("p","受注予定日・確定日が選択月に入る商談を区分別に集計します。各金額は重複しません。","sub"));
    const blocks=el("div",undefined,"crm-kpis");
    const groups=el("div",undefined,"crm-split");
    for (const [index,label] of forecastCategories.entries()) {
      const deals=matching.filter(x=>forecastFor(x)===index);
      const metric=el("div",label,"crm-panel");
      metric.append(el("strong",yen.format(deals.reduce((sum,x)=>sum+x.amount,0))));blocks.append(metric);
      const detail=panel(label);
      detail.append(list(deals,x=>[button(x.title,()=>editDeal(d,x)),el("p",companyName(d,x.account)+"　"+yen.format(x.amount)+"　"+x.close,"sub")],"対象商談はありません。"));
      groups.append(detail);
    }
    section.append(blocks,groups);
    return section;
  }
  const tabs={overview:report,accounts,leads,campaigns,deals,forecast,activities,transfer};
  const menu=$("crm-tabs").querySelectorAll("[data-crm]");
  function renderCrm() {
    const d=data();
    persist();
    if (filter && !find(d.accounts,filter)) filter="";
    for (const item of menu) item.setAttribute("aria-pressed",String(item.dataset.crm===tab));
    $("crm-content").replaceChildren(tabs[tab](d));
  }
  for (const item of menu) item.onclick=()=>showTab(item.dataset.crm);
  crmRefresh=renderCrm;
})();
