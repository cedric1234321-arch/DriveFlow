(() => {
"use strict";

const W=globalThis.DriveFlowV6WriteUI;
if(!W)return;

W.pickFile=(accept,handler)=>{
  const input=document.createElement("input");
  input.type="file";
  input.accept=accept||"";
  input.setAttribute("aria-hidden","true");
  input.style.position="fixed";
  input.style.left="-10000px";
  input.style.top="0";
  input.style.width="1px";
  input.style.height="1px";
  input.style.opacity="0";
  document.body.appendChild(input);

  let finished=false;
  const cleanup=()=>{if(finished)return;finished=true;input.remove();};
  input.addEventListener("change",async()=>{
    const file=input.files?.[0];
    if(!file){cleanup();return;}
    try{
      await handler(file);
    }catch(e){
      alert(e?.message||"Import impossible.");
    }finally{
      cleanup();
    }
  },{once:true});

  // Keep the click synchronous with the user's tap. Safari/iOS is stricter
  // than desktop browsers about programmatic file pickers.
  input.click();
};

globalThis.DriveFlowV6IOSFilePicker=true;
})();