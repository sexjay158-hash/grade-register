import {FEATURES} from './flags';

const STORAGE_KEY='grade-register.baidu-ocr';
export type OcrCredentials={apiKey:string;secretKey:string};

export function loadOcrCredentials():OcrCredentials|null{
 if(!FEATURES.rememberOcrCredentials||typeof window==='undefined')return null;
 try{
  const value=JSON.parse(window.localStorage.getItem(STORAGE_KEY)??'null');
  return typeof value?.apiKey==='string'&&typeof value?.secretKey==='string'?value:null;
 }catch{return null;}
}

export function saveOcrCredentials(value:OcrCredentials){
 if(!FEATURES.rememberOcrCredentials||typeof window==='undefined')return;
 window.localStorage.setItem(STORAGE_KEY,JSON.stringify(value));
}

export function clearOcrCredentials(){
 if(typeof window!=='undefined')window.localStorage.removeItem(STORAGE_KEY);
}
