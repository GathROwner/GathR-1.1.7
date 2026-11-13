const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]),playwrightPath=process.argv[3];
fs.mkdirSync(out,{recursive:true});
const babel=require('@babel/core'),traverse=require('@babel/traverse').default;
const originalLoad=Module._load,originalJS=require.extensions['.js'];
const RNW=require('react-native-web'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
let selectedFilters,fontScale=1;
const ScaledText=React.forwardRef((props,ref)=>{
 const style=RNW.StyleSheet.flatten(props.style)||{};
 return React.createElement(RNW.Text,{...props,ref,style:[props.style,props.allowFontScaling===false?{}:{fontSize:(style.fontSize||14)*fontScale,...(style.lineHeight?{lineHeight:style.lineHeight*fontScale}:{})}]});
});
Module._load=function(id,parent,...args){
 if(id==='react-native')return {...RNW,Text:ScaledText};
 if(id==='expo-font')return {isLoaded:()=>true,loadAsync:async()=>{}};
 if(id==='../store'&&parent?.filename===path.join(root,'hooks/useVisitingHoursView.ts'))return {useMapStore:selector=>selector({filterCriteria:{eventFilters:selectedFilters,specialFilters:selectedFilters}})};
 return originalLoad.call(this,id,parent,...args);
};
const compile=(mod,filename,ts)=>mod._compile(babel.transformSync(fs.readFileSync(filename,'utf8'),{filename,babelrc:false,configFile:false,
 presets:ts?[['@babel/preset-typescript',{allExtensions:true,isTSX:filename.endsWith('.tsx')}]]:[],
 plugins:[['@babel/plugin-transform-react-jsx',{runtime:'classic'}],'@babel/plugin-transform-modules-commonjs']}).code,filename);
require.extensions['.ts']=(mod,filename)=>compile(mod,filename,true);require.extensions['.tsx']=require.extensions['.ts'];
require.extensions['.js']=(mod,filename)=>filename.includes(path.join('@expo','vector-icons'))?compile(mod,filename,false):originalJS(mod,filename);
require.extensions['.ttf']=(mod,filename)=>{mod.exports=filename;};global.__DEV__=false;
const NativeDate=Date,frozen=new NativeDate('2026-11-02T17:00:00Z');
global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[frozen.getTime()]));}static now(){return frozen.getTime();}};
const MaterialIcons=require('@expo/vector-icons/MaterialIcons').default;
const {EventTimingSummaryText}=require('../components/common/EventTimingSummaryText.tsx'),{EventTimingBadge}=require('../components/common/EventTimingBadge.tsx');
const {EventSeriesContextLine}=require('../components/common/EventSeriesContextLine.tsx');
const {EventTimingDisclosureActions}=require('../components/map/EventTimingDisclosureActions.tsx');
const {getEventTimingDisclosure}=require('../utils/eventTiming.ts'),{getEventDisplayUntilDate}=require('../utils/dateUtils.ts');
const {getEventScheduleContext}=require('../utils/eventSeries.ts');
const {offerAvailabilityFixture}=require('../utils/__tests__/fixtures/offerAvailability.ts');
const BRAND={primaryDark:'#0066CC'};
const parse=filename=>{const source=fs.readFileSync(filename,'utf8');return {source,ast:babel.parseSync(source,{filename,babelrc:false,configFile:false,parserOpts:{plugins:['typescript','jsx']}})};};
const styleExpression=node=>node.type==='JSXElement'&&node.openingElement.attributes.find(a=>a.type==='JSXAttribute'&&a.name.name==='style')?.value?.expression;
function extract(filename,styleName,wantedStyles){
 const {source,ast}=parse(filename);let jsx,stylesNode;const functions=[];
 traverse(ast,{JSXElement(p){const e=styleExpression(p.node);if(e?.type==='MemberExpression'&&e.object.name==='styles'&&e.property.name===styleName)jsx=source.slice(p.node.start,p.node.end);},
 VariableDeclarator(p){if(p.node.id.name==='styles'&&p.node.init?.type==='CallExpression'&&p.node.init.callee?.object?.name==='StyleSheet')stylesNode=p.node.init.arguments[0];},
 FunctionDeclaration(p){if(['isFutureDate','formatEndDateLabel'].includes(p.node.id?.name))functions.push(source.slice(p.node.start,p.node.end));}});
 if(!jsx||!stylesNode)throw Error('Missing actual parent subtree: '+filename);
 const styleSource='{'+stylesNode.properties.filter(p=>wantedStyles.includes(p.key?.name)).map(p=>source.slice(p.start,p.end)).join(',')+'}';
 const styles=Function('BRAND','StyleSheet','Platform','return ('+styleSource+')')(BRAND,RNW.StyleSheet,RNW.Platform);
 const code=babel.transformSync(functions.join('\n')+'\nfunction ParentTimingSubtree({event,expanded=false}){const updatedEvent=event,isHappeningNow=false,scheduleContext=null,endDateSuffix="",isPrivateFriendEvent=false,remainingCampaignText=null,scheduleExpanded=false,timingDisclosureExpanded=expanded; const originalSourceUrl=event.timing.availability.sourceOffer.url,timingHelpText=getEventTimingDisclosure(event,new Date(),selectedDate),scheduleExpandedNoop=()=>{}; const animateDetails=()=>{},setScheduleExpanded=()=>{},setTimingDisclosureExpanded=()=>{},handleReportIncorrectTime=()=>{};return ('+jsx+');}',{filename:'parent.tsx',babelrc:false,configFile:false,presets:[['@babel/preset-typescript',{allExtensions:true,isTSX:true}]],plugins:[['@babel/plugin-transform-react-jsx',{runtime:'classic'}]]}).code;
 return {filename,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),jsx,styles,code};
}
const card=extract(path.join(root,'app/(tabs)/specials.tsx'),'contentSection',['contentSection','dateTimeRow','dateTimeText','cardTitle','seriesContextLine','timingBadge','eventCard']);
const lightbox=extract(path.join(root,'components/map/EventImageLightbox.tsx'),'infoContainer',['infoContainer','infoRow','infoText','timingBadge','timingSummaryGroup','timingSummaryText','timingSummaryLabel','timingInfoButton','seriesContextLine','scheduleDetails','scheduleDetailsText','timingDisclosureContainer','timingDisclosureBody','timingDisclosureText','title']);
const context={React,View:RNW.View,Text:ScaledText,TouchableOpacity:RNW.TouchableOpacity,MaterialIcons,EventTimingSummaryText,EventTimingBadge,EventSeriesContextLine,EventTimingDisclosureActions,getEventScheduleContext,getEventDisplayUntilDate,getEventTimingDisclosure,BRAND,Linking:{openURL:()=>{}}};
const instantiate=(part,date)=>Function(...Object.keys(context),'styles','selectedDate',part.code+'; return ParentTimingSubtree;')(...Object.values(context),part.styles,date);
const variants=[{name:'selected-open',date:'2026-11-02'},{name:'selected-closed',date:'2026-11-03'},{name:'unknown-holiday',date:'2026-11-11'},{name:'overnight',date:'2026-11-06'},{name:'range',date:null},{name:'split',date:'2026-11-02',split:true},{name:'unknown-with-tail',date:'2026-11-07',tail:true},{name:'large-font-160',date:'2026-11-06',large:true}];
const fontFile=path.join(root,'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf');
const fontCSS='@font-face{font-family:material;src:url(data:font/ttf;base64,'+fs.readFileSync(fontFile).toString('base64')+')}';
const records=[];
for(const variant of variants){
 const event=offerAvailabilityFixture();fontScale=variant.large?1.6:1;
 if(variant.split)event.timing.availability.dateRules['2026-11-02'].segments=[{open:'11:00',close:'13:00',endDayOffset:0},{open:'17:00',close:'22:00',endDayOffset:0}];
 if(variant.tail)event.timing.availability.dateRules['2026-11-06'].segments=[{open:'18:00',close:'02:00',endDayOffset:1}];
 selectedFilters={timeFilter:'upcoming',...(variant.date?{upcomingDate:{kind:'custom',startDate:variant.date,endDate:variant.date}}:{})};
 const Card=instantiate(card,variant.date),Lightbox=instantiate(lightbox,variant.date),h=React.createElement;
 const body=h(RNW.View,{style:{width:390,minHeight:844,backgroundColor:'#F4F7FA',paddingVertical:18}},
 h(RNW.Text,{style:{fontSize:12,color:'#64748B',paddingHorizontal:16,marginBottom:18}},`${variant.name} · actual parent timing subtrees`),
 h(RNW.Text,{style:{fontSize:12,color:'#64748B',paddingHorizontal:16,marginBottom:8}},'Specials card · production styles'),
 h(RNW.View,{style:[card.styles.eventCard,{paddingTop:12,marginBottom:28}]},h(Card,{event})),
 h(RNW.Text,{style:{fontSize:12,color:'#64748B',paddingHorizontal:16,marginBottom:8}},'Lightbox · collapsed'),
 h(RNW.View,{style:{backgroundColor:'#111318',paddingVertical:14,marginBottom:20}},h(Lightbox,{event})),
 h(RNW.Text,{style:{fontSize:12,color:'#64748B',paddingHorizontal:16,marginBottom:8}},'Lightbox · time details expanded'),
 h(RNW.View,{style:{backgroundColor:'#111318',paddingVertical:14}},h(Lightbox,{event,expanded:true})),
 h(RNW.Text,{style:{fontSize:11,lineHeight:16,color:'#64748B',padding:16}},'Synthetic offer. Exact source JSX and styles extracted from production card/lightbox; actual components and MaterialIcons font. No app, map, ads or device runtime.'));
 const markup=renderToStaticMarkup(body),css=RNW.StyleSheet.getSheet().textContent;
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0}'+fontCSS+css+'</style></head><body>'+markup+'</body></html>';
 const htmlPath=path.join(out,variant.name+'.html');fs.writeFileSync(htmlPath,html);
 records.push({name:variant.name,date:variant.date,fontScale,htmlPath,htmlSHA256:crypto.createHash('sha256').update(html).digest('hex')});
}
global.Date=NativeDate;
(async()=>{const{chromium}=require(playwrightPath);const browser=await chromium.launch({headless:true,...(process.env.OFFER_RENDER_CHROMIUM?{executablePath:process.env.OFFER_RENDER_CHROMIUM}:{})});const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 for(const r of records){await page.goto('file:///'+r.htmlPath.replace(/\\/g,'/'));await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(out,r.name+'.png'),fullPage:true});r.text=await page.locator('body').innerText();r.horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>390);r.screenshotSHA256=crypto.createHash('sha256').update(fs.readFileSync(path.join(out,r.name+'.png'))).digest('hex');}
 await browser.close();fs.writeFileSync(path.join(out,'parent-render-receipt.json'),JSON.stringify({renderer:'React Native Web + exact production parent JSX/styles + real icon component/font',sourceRoot:root,viewport:{width:390,height:844,deviceScaleFactor:2},fixtureClock:frozen.toISOString(),sources:[{file:card.filename,sha256:card.sourceSHA256},{file:lightbox.filename,sha256:lightbox.sourceSHA256}],substitutions:['selected filter store snapshot','Expo font already-loaded provider for server render','RNW Text scales native font size/line height at160%; icons retain production allowFontScaling=false'],records},null,2));process.stdout.write(JSON.stringify({rendered:records.length,out,overflow:records.filter(r=>r.horizontalOverflow).map(r=>r.name)}));})().catch(e=>{process.stderr.write(e.stack);process.exitCode=1;});

