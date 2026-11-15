// Studio: creative effects kept out of Develop — Silver (B&W lab), Two-Tone Flash, Double Exposure,
// Light Leaks, Dust & Scratches, Lens effects, plus one-click Recipes.  Shared by the Mac and phone apps.
// Uses UI.panel / UI.slider / UI.select / UI.check / UI.button / UI.note (phone app maps these to its widgets).
const FILTERS = [['none','No filter',0,0],['red','Red  (dark skies, light skin)',0,85],['orange','Orange',30,70],['yellow','Yellow  (classic)',60,55],
  ['green','Green  (foliage, ruddy skin)',120,65],['blue','Blue  (orthochromatic look)',230,75]];
// Silver film types: band sensitivity [R,Y,G,C,B,M] + grain + tonality, written into the editable controls (like Silver Efex)
const SILVER_FILMS = [
  ['neutral','Neutral (no film)',{sSens:[0,0,0,0,0,0],grain:0,grainSize:1.0,sContrast:0,sAmpW:0,sAmpB:0,sSoft:0}],
  ['trix','Kodak Tri-X 400',{sSens:[8,6,0,-6,-12,0],grain:.75,grainSize:1.1,sContrast:18,sAmpW:0,sAmpB:12,sSoft:0}],
  ['hp5','Ilford HP5 Plus 400',{sSens:[0,6,6,0,-6,0],grain:.65,grainSize:1.05,sContrast:6,sAmpW:0,sAmpB:5,sSoft:0}],
  ['tmax100','Kodak T-Max 100',{sSens:[0,0,0,0,0,0],grain:.2,grainSize:0.65,sContrast:20,sAmpW:5,sAmpB:5,sSoft:0}],
  ['tmax3200','Kodak T-Max P3200',{sSens:[10,8,0,-8,-12,0],grain:1.25,grainSize:1.5,sContrast:10,sAmpW:0,sAmpB:15,sSoft:5}],
  ['delta3200','Ilford Delta 3200',{sSens:[12,6,0,-10,-16,0],grain:1.4,grainSize:1.7,sContrast:-6,sAmpW:0,sAmpB:0,sSoft:12}],
  ['acros','Fuji Acros 100 II',{sSens:[-6,0,12,6,0,0],grain:.15,grainSize:0.6,sContrast:15,sAmpW:12,sAmpB:5,sSoft:0}],
  ['panf','Ilford Pan F Plus 50',{sSens:[6,6,-6,-10,-10,0],grain:.1,grainSize:0.55,sContrast:32,sAmpW:5,sAmpB:18,sSoft:0}],
  ['fp4','Ilford FP4 Plus 125',{sSens:[0,4,4,0,-4,0],grain:.35,grainSize:0.8,sContrast:10,sAmpW:0,sAmpB:5,sSoft:0}],
  ['plusx','Kodak Plus-X 125',{sSens:[4,4,0,-4,-6,0],grain:.35,grainSize:0.8,sContrast:14,sAmpW:5,sAmpB:5,sSoft:0}],
  ['apx','Agfa APX 100',{sSens:[6,0,0,0,-6,0],grain:.4,grainSize:0.85,sContrast:22,sAmpW:0,sAmpB:10,sSoft:0}],
  ['neopan','Fuji Neopan 1600',{sSens:[4,4,0,-4,-8,0],grain:1.0,grainSize:1.4,sContrast:26,sAmpW:0,sAmpB:15,sSoft:0}],
  ['2475','Kodak 2475 Recording',{sSens:[10,6,0,-8,-12,0],grain:1.8,grainSize:2.1,sContrast:30,sAmpW:5,sAmpB:20,sSoft:8}],
  ['xp2','Ilford XP2 Super (chromogenic)',{sSens:[0,0,0,0,0,0],grain:.2,grainSize:0.7,sContrast:-8,sAmpW:0,sAmpB:0,sSoft:12}],
  ['ortho','Orthochromatic (Ortho Plus)',{sSens:[-80,-30,10,30,45,-30],grain:.3,grainSize:0.75,sContrast:24,sAmpW:5,sAmpB:10,sSoft:0}],
  ['sfx','Ilford SFX 200 (near infrared)',{sSens:[55,30,45,-25,-55,10],grain:.6,grainSize:1.1,sContrast:22,sAmpW:25,sAmpB:10,sSoft:10}],
  ['hie','Kodak HIE (infrared)',{sSens:[85,45,90,-40,-75,10],grain:.9,grainSize:1.3,sContrast:20,sAmpW:35,sAmpB:5,sSoft:40}],
];
const SENS_BANDS=[['Red','#e33'],['Yellow','#ec3'],['Green','#3c4'],['Cyan','#3cd'],['Blue','#36e'],['Magenta','#d3c']];
const SILVER_KEYS=['silver','sFilterHue','sFilterAmt','structure','sBurn','sBurnSize','sTone','sToneAmt','sBright','sBrightHi','sBrightSh','sContrast','sAmpW','sAmpB','sSoft','sStructHi','sStructMid','sStructSh','sFine','sSens','sFilmType','sVig','sVigSize','sVigX','sVigY','sBurnT','sBurnB','sBurnL','sBurnR','sToneBal'];
// Analog media: each is a full signal / display / gate recipe; extras touch grain & co. for the cine gauges
const AN_KEYS=['anOn','anMedium','anRes','anLines','anChroma','anShift','anBleed','anSharp','anGhost','anGhostOff','anNoise','anCNoise','anSnow','anTrack','anTrackPos','anHead','anDrop','anJitter','anInterlace','anSat','anHue','anTint',
  'anBlock','anScan','anScanN','anMask','anMaskAmt','anCurve','anBloom','anVig','anCorner','anGate','anOverscan','anGateSoft','anWeave','anFlicker','anOSD','anOSDText'];
const ANALOG_MEDIA=[
  ['vhs','VHS · SP','Consumer tape at standard play: soft luma, smeared colour that bleeds right, sharpening halos, head-switching noise at the bottom, the PLAY overlay.',
    {anRes:45,anChroma:65,anShift:2,anBleed:40,anSharp:35,anNoise:15,anCNoise:30,anTrack:8,anTrackPos:80,anHead:55,anDrop:12,anJitter:12,anSat:-12,anOSD:'vhs'}],
  ['vhsEP','VHS · EP worn tape','Six-hour mode, played a hundred times: heavy chroma smear, tracking band, dropouts, faded colour.',
    {anRes:70,anChroma:85,anShift:4,anBleed:65,anSharp:40,anNoise:32,anCNoise:55,anTrack:45,anTrackPos:62,anHead:85,anDrop:45,anJitter:30,anSat:-28,anHue:6,anOSD:'pause'}],
  ['beta','Betamax','Better luma than VHS, cleaner colour, still analog-soft.',{anRes:32,anChroma:50,anShift:1,anBleed:28,anSharp:25,anNoise:10,anCNoise:20,anHead:40,anJitter:8,anSat:-5}],
  ['hi8','Hi8 camcorder','Late-90s home video: crisp-ish with strong edge enhancement, interlace, the REC overlay.',
    {anRes:28,anChroma:45,anShift:1.5,anBleed:22,anSharp:50,anNoise:18,anCNoise:25,anHead:30,anJitter:6,anSat:8,anInterlace:20,anOSD:'rec'}],
  ['minidv','MiniDV','Early digital tape: sharp, over-enhanced edges, 4:1:1 colour, interlaced.',{anRes:12,anChroma:30,anSharp:60,anNoise:8,anCNoise:10,anInterlace:35,anSat:12,anOSD:'rec'}],
  ['crt','Broadcast CRT TV','An 80s living-room set: shadow mask, scanlines, curved glass, glowing phosphors, dark rounded corners.',
    {anRes:30,anChroma:45,anShift:1,anBleed:20,anGhost:15,anGhostOff:40,anNoise:10,anScan:55,anScanN:480,anMask:'shadow',anMaskAmt:45,anCurve:45,anBloom:35,anVig:45,anCorner:55}],
  ['trinitron','Trinitron monitor','90s flat-ish aperture-grille tube: sharp vertical RGB stripes, gentle scanlines.',
    {anRes:10,anChroma:20,anScan:40,anScanN:480,anMask:'aperture',anMaskAmt:55,anCurve:12,anBloom:25,anVig:20,anCorner:20}],
  ['arcade','Arcade CRT · 240p','Low-res arcade monitor: thick scanlines, slot mask, bloom.',{anRes:8,anLines:240,anScan:70,anScanN:240,anMask:'slot',anMaskAmt:50,anCurve:30,anBloom:40,anVig:30,anCorner:40,anSat:15}],
  ['tv50s','1950s black & white TV','405-line tube: blue-white phosphor, ghosting, snow, deep vignette, round corners.',
    {anRes:45,anLines:405,anGhost:25,anGhostOff:50,anNoise:25,anSnow:15,anJitter:15,anTint:'blue',anScan:60,anScanN:405,anCurve:70,anBloom:45,anVig:65,anCorner:75}],
  ['offair','Off-air bad reception','Rabbit-ear antenna: multipath ghosts, snow, washed colour.',
    {anRes:40,anGhost:45,anGhostOff:70,anNoise:45,anSnow:55,anCNoise:40,anJitter:25,anSat:-35,anScan:40,anScanN:480,anCurve:30,anVig:35,anCorner:40}],
  ['cctv','CCTV security','Monochrome surveillance: interlaced, noisy, timestamp burned in.',{anRes:40,anTint:'mono',anNoise:28,anInterlace:45,anJitter:10,anSharp:30,anOSD:'cctv'}],
  ['nightvision','Camcorder night vision','Infrared NightShot: green, grainy, blooming highlights.',{anTint:'green',anRes:35,anNoise:45,anBloom:35,anVig:60,anSharp:20,anOSD:'rec'}],
  ['ccd','Early CCD digicam (2004)','3-megapixel point-and-shoot: crunchy sharpening, JPEG blocks, clipped highlights, purple fringing, the yellow date stamp.',
    {anRes:8,anSharp:55,anCNoise:18,anNoise:6,anBlock:30,anSat:14,anOSD:'digicam'},{fringe:35,whites:20,highlights:15,contrast:15}],
  ['flipphone','Flip-phone camera (2006)','VGA phone camera: soft, blocky, noisy, over-saturated.',{anRes:40,anChroma:45,anNoise:25,anCNoise:45,anBlock:65,anSat:25,anSharp:20},{fringe:20,whites:25,contrast:20}],
  ['dvd','Over-compressed video','Early web / DVD rip: macro-blocking and colour banding.',{anRes:20,anChroma:40,anBlock:80,anSat:-5}],
  ['webcam','2008 webcam','Tiny sensor, heavy compression smear and colour noise.',{anRes:45,anChroma:55,anNoise:35,anCNoise:40,anSharp:30,anSat:-10}],
  ['super8','Super 8','Home-movie gauge: rounded gate, gate weave, flicker, coarse grain and glow.',
    {anGate:'super8',anGateSoft:45,anWeave:35,anFlicker:30},{grain:1.8,grainSize:1.6,halation:1.2,falloff:0.8,softEdges:20,saturation:12}],
  ['super8scan','Super 8 · full-gate scan','Overscanned: the rounded gate, the film base and the sprocket hole beside the frame.',
    {anGate:'super8',anOverscan:100,anGateSoft:40,anWeave:30,anFlicker:25},{grain:1.8,grainSize:1.6,halation:1.2,falloff:0.6,softEdges:20,saturation:12}],
  ['8mm','Standard 8mm · full scan','Regular 8: tiny frame, perforations at the frame line, very grainy.',
    {anGate:'8mm',anOverscan:100,anGateSoft:50,anWeave:40,anFlicker:35},{grain:2.2,grainSize:1.8,halation:1.3,falloff:0.9,softEdges:30,saturation:18}],
  ['16mm','16mm','Documentary / news 16mm: finer grain, slight weave, soft gate edges.',{anGate:'16mm',anGateSoft:30,anWeave:20,anFlicker:15},{grain:1.2,grainSize:1.3,halation:0.9,falloff:0.5}],
  ['16mmscan','16mm · double-perf scan','Overscanned 16mm with perforations on both sides at the frame lines.',{anGate:'16mm',anOverscan:100,anGateSoft:25,anWeave:18,anFlicker:12},{grain:1.2,grainSize:1.3,halation:0.9,falloff:0.4}],
  ['super16','Super 16 · scan','Wider single-perf 16mm, the indie-film gauge.',{anGate:'super16',anOverscan:70,anGateSoft:25,anWeave:15,anFlicker:10},{grain:1.0,grainSize:1.2,halation:0.8,falloff:0.4}],
  ['35cine','35mm cinema print','A projected release print: slight weave and flicker, perforations either side when overscanned.',{anGate:'35cine',anOverscan:60,anGateSoft:15,anWeave:10,anFlicker:10},{grain:0.6,halation:1.0,falloff:0.5}],
  ['dateback','Date-back film camera','The orange LED date a point-and-shoot burned into the corner.',{anOSD:'filmdate'}],
];
const AM=id=>{ const m=ANALOG_MEDIA.find(x=>x[0]===id); return Object.assign({anOn:true,anMedium:id},JSON.parse(JSON.stringify(m[3])),m[4]||{}); };
const SF=id=>{ const f=SILVER_FILMS.find(x=>x[0]===id); return Object.assign({silver:true,sFilmType:id},JSON.parse(JSON.stringify(f[2]))); };
// Looks. "Group · Name" — the group heads the grid. Develop values a look sets are restored when you pick another look.
const STUDIO_RECIPES = [
  ['Silver · Classic contrast', {...SF('trix'),sFilterHue:30,sFilterAmt:55,sContrast:25,structure:20,sAmpB:15,sBurn:25,sBurnSize:40}],
  ['Silver · Red filter skies', {...SF('hp5'),sFilterHue:0,sFilterAmt:90,sContrast:20,structure:25,sBurnT:40,sBurnSize:45}],
  ['Silver · Dramatic sky', {...SF('apx'),sFilterHue:0,sFilterAmt:100,sContrast:30,sStructHi:40,sAmpB:25,sBurnT:60,sBurnSize:50}],
  ['Silver · Fine art selenium', {...SF('acros'),sFilterHue:60,sFilterAmt:40,structure:10,sTone:'selenium',sToneAmt:70,sSoft:10,sVig:20}],
  ['Silver · Pan F landscape', {...SF('panf'),sFilterHue:60,sFilterAmt:55,structure:30,sFine:25,sBurnT:35,sTone:'selenium',sToneAmt:30}],
  ['Silver · High key', {...SF('fp4'),sBright:40,sBrightSh:30,sContrast:-10,sAmpW:30,structure:-10,sVig:-35,sVigSize:55}],
  ['Silver · Low key noir', {...SF('trix'),sFilterHue:0,sFilterAmt:60,sBright:-35,sBrightHi:10,sContrast:45,sAmpB:40,structure:25,sVig:50,sVigSize:60}],
  ['Silver · Soft & airy', {...SF('xp2'),sBright:15,sContrast:-25,sSoft:35,structure:-20,sTone:'platinum',sToneAmt:45}],
  ['Silver · Gold-toned portrait', {...SF('fp4'),sFilterHue:30,sFilterAmt:40,structure:-10,sSoft:15,sTone:'gold',sToneAmt:60,sVig:25}],
  ['Silver · Orthochromatic portrait', {...SF('ortho'),sContrast:15,structure:15,sTone:'sepia',sToneAmt:25,sVig:15}],
  ['Silver · Infrared dream', {...SF('hie'),sBright:5,sTone:'none'}],
  ['Silver · Pushed 3200', {...SF('delta3200'),sContrast:35,sAmpB:30,structure:30,sBurn:30,sBurnSize:45}],
  ['Silver · Gritty street', {...SF('neopan'),sFilterHue:30,sFilterAmt:50,structure:60,sFine:40,sContrast:40,grain:1.4,grainSize:1.3,sBurn:40}],
  ['Silver · Newspaper', {...SF('2475'),sContrast:50,sAmpB:30,sFine:50}],
  ['Silver · Split tone', {...SF('hp5'),sFilterHue:60,sFilterAmt:45,structure:15,sTone:'split',sToneAmt:80,sToneBal:10,sBurn:25}],
  ['Silver · Copper print', {...SF('fp4'),sTone:'copper',sToneAmt:70,sToneBal:20,sContrast:10,sBurn:20,fx:{texture:{pick:1,amt:30}}}],
  ['Silver · Holga', {...SF('hp5'),sSoft:30,sVig:70,sVigSize:70,softEdges:50,grain:1.0,fx:{frame:{pick:2,amt:100}}}],
  ['Alt process · Wet plate tintype', {...SF('ortho'),structure:35,sContrast:20,sTone:'tintype',sToneAmt:95,sBurn:45,sBurnSize:45,border:'wetplate',dustAmt:30,scratchAmt:20,hairAmt:10,softEdges:25,grain:0.2}],
  ['Wet plate · Heavy silver tintype', {...SF('ortho'),structure:35,sContrast:20,sBurn:35,sBurnSize:45,softEdges:25,grain:0.2,sTone:'tintype',sToneAmt:95,fx:{frame:{id:'frame_tintype_4',amt:100},texture:{id:'tex_collodion_1',amt:55}}}],
  ['Wet plate · Fresh pour', {...SF('ortho'),structure:35,sContrast:20,sBurn:35,sBurnSize:45,softEdges:25,grain:0.2,sTone:'tintype',sToneAmt:85,sAmpW:15,fx:{frame:{id:'frame_tintype_6',amt:100},texture:{id:'tex_collodion_2',amt:50}}}],
  ['Wet plate · Gem in brass', {...SF('ortho'),structure:35,sContrast:20,sBurn:35,sBurnSize:45,softEdges:25,grain:0.2,sTone:'tintype',sToneAmt:90,sVig:40,fx:{frame:{id:'frame_tintype_5',amt:100},texture:{id:'tex_collodion_4',amt:45}}}],
  ['Wet plate · Cased ambrotype', {...SF('ortho'),structure:35,sContrast:20,sBurn:35,sBurnSize:45,softEdges:25,grain:0.2,sTone:'ambrotype',sToneAmt:90,sSoft:15,fx:{frame:{id:'frame_ambrotype_2',amt:100},texture:{id:'tex_collodion_3',amt:40}}}],
  ['Wet plate · Alumitype', {...SF('ortho'),structure:35,sContrast:20,sBurn:35,sBurnSize:45,softEdges:25,grain:0.2,sTone:'sepia',sToneAmt:55,sAmpW:20,fx:{frame:{id:'frame_alumitype_1',amt:100},texture:{id:'tex_collodion_1',amt:35}}}],
  ['Wet plate · Glass plate', {...SF('ortho'),structure:35,sContrast:20,sBurn:35,sBurnSize:45,softEdges:25,grain:0.2,sTone:'selenium',sToneAmt:40,sBright:10,fx:{frame:{id:'frame_glassneg_1',amt:100},texture:{id:'tex_collodion_2',amt:40}}}],
  ['Wet plate · Spirit tintype', {...SF('ortho'),structure:35,sContrast:20,sBurn:35,sBurnSize:45,softEdges:25,grain:0.2,sTone:'tintype',sToneAmt:95,dblId:'__self',dblMode:'screen',dblAmt:40,dblScale:1.2,dblX:0.08,dblSmear:30,dblSmearAng:-80,fx:{frame:{id:'frame_tintype_2',amt:100},texture:{id:'tex_collodion_4',amt:50}}}],
  ['Alt process · Ambrotype', {...SF('ortho'),structure:25,sContrast:10,sSoft:15,sTone:'ambrotype',sToneAmt:90,sBurn:35,softEdges:30,fx:{frame:{id:'frame_ambrotype_1',amt:100}},grain:0.2}],
  ['Alt process · Cyanotype', {...SF('ortho'),sTone:'cyanotype',sToneAmt:100,sContrast:10,sBurn:20,fx:{texture:{pick:0,amt:35}}}],
  ['Analog · Expired roll', {fx:{leak:{pick:0,amt:55},dust:{pick:0,amt:60},texture:{pick:0,amt:25}},softEdges:20,fringe:15,falloff:0.6,saturation:-10}],
  ['Analog · Burnt ending', {fx:{burn:{pick:0,amt:85},dust:{pick:1,amt:40}},contrast:10}],
  ['Analog · Summer leak', {fx:{leak:{pick:1,amt:80},flare:{pick:0,amt:45}},saturation:10}],
  ['Analog · Sunset leak', {leakAmt:60,leakColor:'warm',leakPos:1,leakSize:55}],
  ['Analog · Red edge leak', {leakAmt:70,leakColor:'red',leakPos:0,leakSize:35}],
  ['Analog · Lomo', {fx:{leak:{pick:2,amt:50},frame:{pick:0,amt:100}},softEdges:45,fringe:30,falloff:1.3,saturation:25,contrast:20}],
  ['Analog · Disposable flash', {contrast:20,saturation:15,falloff:1.0,highlights:-15,fx:{leak:{pick:3,amt:35},dust:{pick:0,amt:30}},fringe:15}],
  ['Analog · Faded 70s print', {contrast:-20,saturation:-15,blacks:25,gHiH:45,gHiS:25,gShH:200,gShS:15,fx:{texture:{pick:1,amt:30},dust:{pick:1,amt:30}}}],
  ['Analog · Sun-bleached', {highlights:20,whites:15,saturation:-25,gHiH:40,gHiS:20,fx:{flare:{pick:1,amt:55}}}],
  ['Analog · Cross-processed', {contrast:30,saturation:25,gShH:170,gShS:35,gHiH:60,gHiS:35,gMidH:100,gMidS:10}],
  ['Analog · Redscale', {saturation:20,contrast:15,gShH:10,gShS:50,gMidH:20,gMidS:45,gHiH:40,gHiS:40,fx:{leak:{pick:0,amt:30}}}],
  ['Analog · Bleach bypass', {saturation:-45,contrast:40,whites:15,highlights:-10,fringe:10}],
  ['Analog · Darkroom print', {...SF('fp4'),sFilterHue:60,sFilterAmt:40,structure:20,sTone:'selenium',sToneAmt:40,fx:{texture:{pick:1,amt:35},dust:{pick:2,amt:45,invert:true},frame:{pick:1,amt:100}}}],
  ['Cinema · Teal & orange', {contrast:15,gShH:195,gShS:30,gHiH:35,gHiS:30,saturation:5}],
  ['Cinema · Moody night', {ev:-0.3,contrast:10,gShH:220,gShS:30,gMidH:210,gMidS:10,halation:1.5,glow:0.3,saturation:-10}],
  ['Media · VHS', AM('vhs')], ['Media · Worn VHS tape', AM('vhsEP')], ['Media · Hi8 home video', AM('hi8')], ['Media · MiniDV', AM('minidv')],
  ['Media · 80s CRT TV', AM('crt')], ['Media · Trinitron', AM('trinitron')], ['Media · Arcade 240p', AM('arcade')], ['Media · 1950s TV', {...AM('tv50s'),...SF('plusx')}],
  ['Media · Bad reception', AM('offair')], ['Media · CCTV', AM('cctv')], ['Media · Night vision', AM('nightvision')], ['Media · 2008 webcam', AM('webcam')],
  ['Media · Super 8', {...AM('super8'),gShH:30,gShS:15,gHiH:45,gHiS:20}], ['Media · Super 8 scan', {...AM('super8scan'),gHiH:45,gHiS:20}], ['Media · Standard 8mm', AM('8mm')],
  ['Media · 16mm', AM('16mm')], ['Media · 16mm B&W scan', {...AM('16mmscan'),...SF('trix')}], ['Media · Super 16', AM('super16')], ['Media · 35mm print', AM('35cine')],
  ['Media · CCD digicam 2004', AM('ccd')], ['Media · Flip phone 2006', AM('flipphone')], ['Media · Over-compressed', AM('dvd')],
  ['Media · Date-back point & shoot', {...AM('dateback'),contrast:10,saturation:10,falloff:0.5}],
  ['Cinema · Anamorphic night', {flare:70,flareColor:'blue',flareLen:75,flareGhost:40,flareSens:60,contrast:10,gShH:215,gShS:20,halation:1.2}],
  ['Cinema · Golden flare', {flare:60,flareColor:'amber',flareLen:55,flareGhost:55,flareSens:45,gHiH:40,gHiS:25,glow:0.2}],
  ['Cinema · Dreamy halation', {glow:0.6,halation:1.8,softEdges:30,highlights:-10,fx:{flare:{pick:0,amt:40}}}],
  ['Creative · Toy camera', {softEdges:60,fringe:40,falloff:1.2,leakAmt:25,leakColor:'magenta',saturation:20,contrast:15}],
  ['Creative · Zoom burst', {zoomBlur:55}],
  ['Creative · Motion streak', {motionBlur:45,motionAngle:0,fx:{leak:{pick:1,amt:40}}}],
  ['Creative · Tilt-shift miniature', {tiltShift:70,tiltPos:58,tiltWidth:16,saturation:25,contrast:15}],
  ['Creative · Prism fringe', {fringe:70,softEdges:25,fx:{flare:{pick:2,amt:50},leak:{pick:2,amt:30}}}],
  ['Creative · Bubble lens', {distort:-60,softEdges:40,falloff:0.8,fringe:20}],
  ['Two-tone · Red / cyan', {ttOn:true,ttPalette:'red-cyan',ttGhost:80,ttMono:85,ttDX:6,ttDY:-4,ttScale:100,ttBand:0}],
  ['Two-tone · Slit band', {ttOn:true,ttPalette:'red-cyan',ttGhost:90,ttMono:90,ttDX:-4,ttDY:-12,ttScale:104,ttBand:38,ttBandPos:48}],
  ['Two-tone · Pink / blue', {ttOn:true,ttPalette:'pink-blue',ttGhost:75,ttMono:70,ttDX:5,ttDY:3,ttScale:103,ttBand:0}],
  ['Two-tone · Purple / yellow drag', {ttOn:true,ttPalette:'purple-yellow',ttGhost:95,ttMono:80,ttDX:12,ttDY:0,ttScale:100,motionBlur:25,motionAngle:0}],
  ['Ghost · Motion ghost', {dblId:'__self',dblMode:'screen',dblAmt:75,dblScale:1.05,dblX:0.06,dblSmear:55,dblSmearAng:0}],
  ['Ghost · Rear-curtain drag', {dblId:'__self',dblMode:'add',dblAmt:75,dblEv:-0.6,dblSmear:65,dblSmearAng:0,contrast:15}],
  ['Ghost · Zoom pulse', {dblId:'__self',dblMode:'add',dblAmt:50,dblScale:1.12,dblZoom:60}],
  ['Ghost · Triple echo', {dblId:'__self',dblMode:'lighten',dblAmt:75,dblEchoes:3,dblEchoX:0.06,dblEchoY:0,dblEchoFade:40}],
  ['Ghost · Vertical drag B&W', {dblId:'__self',dblMode:'screen',dblAmt:50,dblSmear:70,dblSmearAng:90,...SF('hp5'),sContrast:20}],
  ['Ghost · Mirror twin', {dblId:'__self',dblMode:'lighten',dblAmt:70,dblFlip:true}],
  ['Ghost · Dream bloom', {dblId:'__self',dblMode:'screen',dblAmt:60,dblScale:1.3,dblZoom:30,softEdges:30,glow:0.4,halation:1.2}],
  ['Ghost · Stutter (5 echoes)', {dblId:'__self',dblMode:'lighten',dblAmt:80,dblEchoes:5,dblEchoX:0.025,dblEchoY:-0.01,dblEchoFade:30,dblSmear:15,...AM('16mm')}],
  ['Ghost · Spirit photo', {dblId:'__self',dblMode:'screen',dblAmt:45,dblScale:1.6,dblX:0.12,dblY:-0.05,dblSmear:25,dblSmearAng:-70,...SF('ortho'),sTone:'sepia',sToneAmt:60,sVig:50,dustAmt:40,scratchAmt:20}],
  ['Ghost · Neon double', {dblId:'__self',dblMode:'screen',dblAmt:65,dblX:-0.03,dblY:0.02,dblSmear:20,ttOn:true,ttPalette:'magenta-green',ttGhost:70,ttMono:60,ttDX:4,ttDY:0,ttScale:100}],
  ['Double · In-camera', {dblMode:'add',dblAmt:70}],
  ['Double · Silhouette', {dblMode:'silhouette',dblAmt:100,dblMask:0}],
  ['Double · Silver dream', {dblMode:'screen',dblAmt:80,...SF('hp5'),sSoft:25,sTone:'selenium',sToneAmt:40}],
];
const STUDIO_KEYS = ['silver','sFilterHue','sFilterAmt','structure','sBurn','sBurnSize','sTone','sToneAmt','ttOn','ttPalette','ttGhost','ttMono','ttDX','ttDY','ttScale','ttBand','ttBandPos',
  'dblId','dblMode','dblAmt','dblEv','dblScale','dblX','dblY','dblRot','dblFlip','dblMask','dblSmear','dblSmearAng','dblZoom','dblEchoes','dblEchoX','dblEchoY','dblEchoFade','leakAmt','leakColor','leakPos','leakSize','leakSeed',
  'dustAmt','scratchAmt','hairAmt','dustSeed','dustKind','fx','cps',...AN_KEYS,'flare','flareLen','flareGhost','flareColor','flareSens','zoomBlur','motionBlur','motionAngle','softEdges','tiltShift','tiltPos','tiltWidth','fringe','distort'].concat(SILVER_KEYS.filter(k=>!['silver','sFilterHue','sFilterAmt','structure','sBurn','sBurnSize','sTone','sToneAmt'].includes(k)));

const Studio = {
  host:null,
  init(host){ this.host=host; },
  P(){ return Engine.p; },
  set(k){ return v=>{ this.P()[k]=v; this.host.changed(); }; },
  S(parent,key,label,o){ return UI.slider(parent,'st_'+key,label,Object.assign({def:DEFAULTS[key],get:()=>this.P()[key],set:this.set(key),commit:()=>this.host.commit()},o)); },
  sel(parent,key,label,opts){ return UI.select(parent,'st_'+key,label,()=>opts,()=>String(this.P()[key]),v=>{ const d=DEFAULTS[key]; this.P()[key]= typeof d==='number'?+v:v; this.host.changed(); this.host.commit(); }); },
  reset(keys){ keys.forEach(k=>this.P()[k]=cloneParams(DEFAULTS[k])); this.host.changed(); this.host.commit(); UI.refresh(); },
  // ---- asset layers
  assets(cat){ return (Engine.assetList||[]).filter(a=>a.cat===cat); },
  resolveFx(fx){ const out={}; for(const key in fx||{}){ const cat=key.replace(/\d+$/,''), L=Object.assign({},fx[key]); if(L.id&&!this.assets(cat).some(a=>a.id===L.id)){ delete L.id; if(L.pick===undefined) L.pick=0; } if(L.pick!==undefined){ const list=this.assets(cat); if(!list.length) continue; L.id=list[L.pick%list.length].id; delete L.pick; } out[key]=L; } return out; },
  layer(cat){ const p=this.P(); if(!p.fx||p.fx===DEFAULTS.fx) p.fx={}; return p.fx[cat]||(p.fx[cat]={id:'',amt:0}); },
  // a look replaces the previous look: Studio starts clean, and Develop values the last look changed go back first
  recipeParams(r,base){ const o=cloneParams(base||this.P()); r=cloneParams(r);
    const lu=o.lookUndo||{}; for(const k in lu) o[k]=cloneParams(lu[k]);
    const keepDbl=o.dblId, keepPlace={dblX:o.dblX,dblY:o.dblY,dblScale:o.dblScale,dblRot:o.dblRot}; STUDIO_KEYS.forEach(k=>o[k]=cloneParams(DEFAULTS[k])); o.fx={};
    if(keepDbl&&(r.dblMode||r.dblId)){ o.dblId=keepDbl; Object.assign(o,keepPlace); }
    o.lookUndo={}; for(const k in r) if(!STUDIO_KEYS.includes(k)&&k!=='fx') o.lookUndo[k]=cloneParams(o[k]); if(r.fx){ r.fx=this.resolveFx(r.fx); if(r.border==='wetplate'&&r.fx.frame) delete r.border; } Object.assign(o,r);
    if(r.border==='wetplate'){ const t=this.assets('frame').find(a=>/tintype|wetplate|wet-plate/i.test(a.id+a.name)); if(t){ delete o.border; o.border=this.P().border; o.fx=Object.assign({},o.fx,{frame:{id:t.id,amt:100}}); } } if(r.border==='wetplate'&&!o.edgeText) o.edgeText='none'; return o; },
  applyRecipe(r,name){ this.host.applyToOthers&&this.host.applyToOthers(base=>this.recipeParams(r,base),name);
    const keep=this.P().dblId; Object.assign(Engine.p,this.recipeParams(r)); if(keep&&!Engine.p.dblId){ this._lastDbl=keep; Engine.setDouble(null); } if(Engine.p.dblId&&Engine.p.dblId!=='__self'&&this.host.loadDouble) this.host.loadDouble();
    if(r.dblMode && !Engine.p.dblId) this.host.toast('Pick the second photo in Double Exposure'); this.host.changed(); this.host.commit(); UI.refresh(); this.refreshAssets();
    const dev=Object.keys(Engine.p.lookUndo||{}); const NM={contrast:'Contrast',saturation:'Saturation',vibrance:'Vibrance',falloff:'Vignette',grain:'Grain',grainSize:'Grain',border:'Frame',edgeText:'Frame',ev:'Exposure',highlights:'Highlights',shadows:'Shadows',temp:'White balance',tint:'White balance',halation:'Halation',glow:'Glow',stock:'Film',blacks:'Blacks',whites:'Whites'};
    this.host.toast('Applied '+name+(dev.length?' — also set in Develop: '+[...new Set(dev.map(k=>NM[k]||k))].join(', '):'')); this.host.openEdited&&this.host.openEdited(); },
  resetAll(){ this.dragTarget=null; this.reset(STUDIO_KEYS); this.P().fx={}; if(this.P().border==='wetplate') this.P().border='none'; Engine.setDouble(null); this.host.changed(); },

  build(root,only){
    root.innerHTML=''; const H=this.host, P=()=>this.P(); const want=id=>!only||only===id; let b;
    // ---------------------------------------------------------------- Silver
    if(want('sSilver')){
    b=UI.panel(root,'sSilver','Silver — Black & White',true,()=>this.reset(SILVER_KEYS));
    const sub=t=>{ const h=document.createElement('div'); h.className='ahead'; h.textContent=t; b.appendChild(h); };
    const on=()=>{ if(!P().silver){ P().silver=true; UI.refresh(); } };
    const SS=(k,l,o)=>this.S(b,k,l,Object.assign({set:v=>{ P()[k]=v; if(!P().silver){ P().silver=true; UI.refresh(); } H.changed(); }},o));
    UI.check(b,'st_silver','Convert to black & white',()=>P().silver,v=>{ P().silver=v; H.changed(); H.commit(); });
    sub('Global adjustments');
    SS('sBright','Brightness',{min:-100,max:100,step:1}); SS('sBrightHi','\u2003Highlights',{min:-100,max:100,step:1}); SS('sBrightSh','\u2003Shadows',{min:-100,max:100,step:1});
    SS('sContrast','Contrast',{min:-100,max:100,step:1}); SS('sAmpW','Amplify whites',{min:0,max:100,step:1}); SS('sAmpB','Amplify blacks',{min:0,max:100,step:1}); SS('sSoft','Soft contrast',{min:0,max:100,step:1});
    SS('structure','Structure',{min:-100,max:100,step:1}); SS('sStructHi','\u2003Highlights',{min:-100,max:100,step:1}); SS('sStructMid','\u2003Midtones',{min:-100,max:100,step:1}); SS('sStructSh','\u2003Shadows',{min:-100,max:100,step:1}); SS('sFine','\u2003Fine structure',{min:-100,max:100,step:1});
    sub('Color filter');
    UI.select(b,'st_filter','Filter',()=>FILTERS.map(f=>[f[0],f[1]]),()=>{ const f=FILTERS.find(f=>f[3]&&Math.abs(f[2]-P().sFilterHue)<1)||FILTERS[0]; return P().sFilterAmt>0?f[0]:'none'; },
      v=>{ const f=FILTERS.find(x=>x[0]===v); P().sFilterHue=f[2]; P().sFilterAmt=f[3]; if(f[3]) P().silver=true; H.changed(); H.commit(); UI.refresh(); });
    SS('sFilterHue','Hue',{min:0,max:359,step:1,fmt:x=>Math.round(x)+'°',track:'linear-gradient(90deg,#f33,#fb3,#3f3,#3ff,#33f,#f3f,#f33)'});
    SS('sFilterAmt','Strength',{min:0,max:100,step:1});
    sub('Film type');
    UI.select(b,'st_sfilm','Film',()=>SILVER_FILMS.map(f=>[f[0],f[1]]),()=>P().sFilmType||'neutral',v=>{ const f=SILVER_FILMS.find(x=>x[0]===v); Object.assign(P(),cloneParams(f[2]),{sFilmType:v,silver:true}); H.changed(); H.commit(); UI.refresh(); });
    SENS_BANDS.forEach(([n,c],i)=>UI.slider(b,'st_sens'+i,'\u2003'+n,{min:-100,max:100,step:1,def:0,track:`linear-gradient(90deg,#111,${c})`,get:()=>(P().sSens||[])[i]||0,set:v=>{ const a=(P().sSens||[0,0,0,0,0,0]).slice(); a[i]=v; P().sSens=a; on(); H.changed(); },commit:()=>H.commit()}));
    UI.note(b,'Each film sees colour differently: these sliders set how bright each colour lands in grey, plus grain (Develop → Grain) and tonality above.');
    sub('Finishing');
    UI.select(b,'st_tone','Toning',()=>[['none','None'],['selenium','Selenium'],['sepia','Sepia'],['gold','Gold'],['platinum','Platinum'],['copper','Copper'],['cyanotype','Cyanotype'],['tintype','Tintype'],['ambrotype','Ambrotype'],['split','Split (cool shadows, warm highlights)']],()=>P().sTone,v=>{ P().sTone=v; on(); H.changed(); H.commit(); });
    SS('sToneAmt','\u2003Strength',{min:0,max:100,step:1}); SS('sToneBal','\u2003Balance',{min:-100,max:100,step:1,fmt:x=>x<0?'shadows '+(-x):x>0?'highlights '+x:'even'});
    SS('sVig','Vignette',{min:-100,max:100,step:1}); SS('sVigSize','\u2003Size',{min:0,max:100,step:1});
    SS('sVigX','\u2003Centre ←→',{min:-1,max:1,step:0.01,fmt:x=>(x*100).toFixed(0)}); SS('sVigY','\u2003Centre ↑↓',{min:-1,max:1,step:0.01,fmt:x=>(x*100).toFixed(0)});
    SS('sBurn','Burn edges (all)',{min:0,max:100,step:1}); SS('sBurnT','\u2003Top',{min:0,max:100,step:1}); SS('sBurnB','\u2003Bottom',{min:0,max:100,step:1}); SS('sBurnL','\u2003Left',{min:0,max:100,step:1}); SS('sBurnR','\u2003Right',{min:0,max:100,step:1}); SS('sBurnSize','\u2003Size',{min:5,max:90,step:1});
    UI.select(b,'st_bwfilm','Film look underneath',()=>[['', 'Keep current film']].concat(Engine.manifest.stocks.filter(s=>s.type==='bw'&&!s.instant).map(s=>[s.id,s.maker+' '+s.name])),()=>'',
      async v=>{ if(!v) return; await H.setStock(v); P().silver=true; H.changed(); H.commit(); UI.refresh(); });
    sub('Zone system');
    { const z=document.createElement('div'); z.className='zones'; b.appendChild(z);
      for(let i=0;i<=10;i++){ const c=document.createElement('span'); const g=Math.round(255*Math.pow(i/10,1)); c.style.background=`rgb(${g},${g},${g})`; c.style.color=i<6?'#ccc':'#222'; c.textContent=['0','I','II','III','IV','V','VI','VII','VIII','IX','X'][i];
        c.onmouseenter=()=>{ Engine.view.zones=true; Engine.view.zoneHi=i; Engine.dirty=true; }; c.onmouseleave=()=>{ Engine.view.zones=!!this._zonesPinned; Engine.view.zoneHi=-1; Engine.dirty=true; };
        c.onclick=()=>{ this._zonesPinned=!this._zonesPinned; Engine.view.zones=this._zonesPinned; z.classList.toggle('pinned',this._zonesPinned); Engine.dirty=true; }; z.appendChild(c); } }
    UI.note(b,'Hover a zone to see where it falls in the photo (Ansel Adams zones 0–X). Click to keep the zone map on.');
    }
    // ---------------------------------------------------------------- Control points
    if(want('sPoints')){
    b=UI.panel(root,'sPoints','Control Points',true,()=>{ P().cps=[]; this.cpSel=-1; H.changed(); H.commit(); UI.refresh(); });
    const list=document.createElement('div'); list.className='cpList'; b.appendChild(list);
    const cur=()=>(P().cps||[])[this.cpSel];
    const CS=(k,l,o)=>UI.slider(b,'cp_'+k,l,Object.assign({min:-100,max:100,step:1,def:0,get:()=>{ const c=cur(); return c?(c[k]||0):0; },set:v=>{ const c=cur(); if(!c) return; c[k]=v; H.changed(); },commit:()=>H.commit()},o));
    const sliders=[CS('r','Size',{min:3,max:80,step:0.5,def:15,get:()=>{ const c=cur(); return c?Math.round((c.r||0.15)*100*2)/2:15; },set:v=>{ const c=cur(); if(!c) return; c.r=v/100; H.changed(); },fmt:x=>Math.round(x)+'%'}),
      CS('b','Brightness'),CS('c','Contrast'),CS('s','Saturation'),CS('st','Structure'),CS('w','Warmth')];
    const row=document.createElement('div'); row.className='btnrow'; b.appendChild(row);
    const del=UI.button(row,'Delete point',()=>{ const a=P().cps||[]; if(this.cpSel<0||!a[this.cpSel]) return; a.splice(this.cpSel,1); this.cpSel=Math.min(this.cpSel,a.length-1); H.changed(); H.commit(); this.renderCP(); });
    UI.button(row,'Duplicate',()=>{ const c=cur(); if(!c) return; const a=P().cps; if(a.length>=8) return; const n=JSON.parse(JSON.stringify(c)); n.x=Math.min(.95,n.x+.05); a.push(n); this.cpSel=a.length-1; H.changed(); H.commit(); this.renderCP(); });
    UI.note(b,'Click <b>+ Add point</b>, then click the photo. A point changes the area around it that is similar in colour and brightness to the spot you clicked — like Nik’s U Point. Drag a point to move it; drag its ring to resize.');
    this.renderCP=()=>{ list.innerHTML=''; const a=P().cps||[]; if(this.cpSel>=a.length) this.cpSel=a.length-1;
      a.forEach((c,i)=>{ const t=document.createElement('button'); t.className='ltab'+(i===this.cpSel?' on':''); t.textContent=String(i+1); t.onclick=()=>{ this.cpSel=i; this.renderCP(); UI.refresh(); H.cpOverlay&&H.cpOverlay(); }; list.appendChild(t); });
      const add=document.createElement('button'); add.className='ltab add cpAdd'+(this.cpAdding?' on':''); add.textContent=this.cpAdding?'Click the photo…':'+ Add point';
      add.onclick=()=>{ if((P().cps||[]).length>=8){ H.toast&&H.toast('Up to 8 control points'); return; } this.cpAdding=!this.cpAdding; this.renderCP(); }; list.appendChild(add);
      const has=!!cur(); sliders.forEach(d=>d.style.display=has?'':'none'); row.style.display=has?'':'none'; H.cpOverlay&&H.cpOverlay(); };
    this.cpSel=this.cpSel??-1; this.renderCP();
    (this._agrids=this._agrids||[]).push([list,()=>this.renderCP()]);
    }
    // ---------------------------------------------------------------- Two-tone flash
    if(want('sTwoTone')){
    b=UI.panel(root,'sTwoTone','Two-Tone Flash',false,()=>this.reset(['ttOn','ttPalette','ttGhost','ttMono','ttDX','ttDY','ttScale','ttBand','ttBandPos']));
    UI.check(b,'st_tt','Two coloured flashes',()=>P().ttOn,v=>{ P().ttOn=v; H.changed(); H.commit(); });
    this.sel(b,'ttPalette','Gels',[['red-cyan','Red / Cyan'],['magenta-green','Magenta / Green'],['blue-orange','Blue / Orange'],['pink-blue','Pink / Blue'],['purple-yellow','Purple / Yellow'],['red-blue','Red / Blue']]);
    this.S(b,'ttGhost','Second flash',{min:0,max:150,step:1});
    this.S(b,'ttMono','Gel purity',{min:0,max:100,step:1});
    this.S(b,'ttDX','Ghost offset ←→',{min:-30,max:30,step:0.5,fmt:x=>(x>0?'+':'')+x.toFixed(1)});
    this.S(b,'ttDY','Ghost offset ↑↓',{min:-30,max:30,step:0.5,fmt:x=>(x>0?'+':'')+x.toFixed(1)});
    this.S(b,'ttScale','Ghost size',{min:70,max:140,step:1,fmt:x=>Math.round(x)+'%'});
    this.S(b,'ttBand','Slit band',{min:0,max:100,step:1,fmt:x=>x?Math.round(x)+'%':'Full frame'});
    this.S(b,'ttBandPos','Band position',{min:0,max:100,step:1});
    UI.note(b,'A rear-curtain style ghost: the frame lit by one gel, plus a shifted second exposure lit by the other.');
    }
    // ---------------------------------------------------------------- Double exposure
    if(want('sDouble')){
    b=UI.panel(root,'sDouble','Double Exposure',false,()=>{ this.reset(['dblId','dblMode','dblAmt','dblEv','dblScale','dblX','dblY','dblRot','dblFlip','dblMask','dblSmear','dblSmearAng','dblZoom','dblEchoes','dblEchoX','dblEchoY','dblEchoFade']); Engine.setDouble(null); });
    if(H.doubleChooser) H.doubleChooser(b);
    this.sel(b,'dblMode','Blend',[['add','In-camera (add exposures)'],['screen','Screen'],['lighten','Lighten'],['darken','Darken'],['multiply','Multiply'],['silhouette','Silhouette (fill the brights)']]);
    this.S(b,'dblAmt','Amount',{min:0,max:100,step:1});
    this.S(b,'dblEv','Second exposure',{min:-3,max:3,step:0.05,fmt:x=>(x>0?'+':'')+x.toFixed(2)+' EV'});
    this.S(b,'dblScale','Scale',{min:0.3,max:3,step:0.01,fmt:x=>Math.round(x*100)+'%'});
    this.S(b,'dblX','Move ←→',{min:-0.6,max:0.6,step:0.005,fmt:x=>Math.round(x*100)});
    this.S(b,'dblY','Move ↑↓',{min:-0.6,max:0.6,step:0.005,fmt:x=>Math.round(x*100)});
    this.S(b,'dblRot','Rotate',{min:-180,max:180,step:0.5,fmt:x=>x.toFixed(1)+'°'});
    UI.check(b,'st_dflip','Flip second photo',()=>P().dblFlip,v=>{ P().dblFlip=v; H.changed(); H.commit(); });
    this.S(b,'dblMask','Silhouette threshold',{min:-60,max:60,step:1});
    { const h=document.createElement('div'); h.className='ahead'; h.textContent='Ghosting'; b.appendChild(h); }
    this.S(b,'dblSmear','Smear (camera moved)',{min:0,max:100,step:1}); this.S(b,'dblSmearAng','Smear direction',{min:-180,max:180,step:1,fmt:x=>Math.round(x)+'°'});
    this.S(b,'dblZoom','Zoom smear',{min:-100,max:100,step:1});
    this.S(b,'dblEchoes','Echoes',{min:1,max:6,step:1,fmt:x=>Math.round(x)===1?'Off':Math.round(x)+' copies'});
    this.S(b,'dblEchoX','Echo spacing ←→',{min:-0.3,max:0.3,step:0.005,fmt:x=>(x*100).toFixed(0)}); this.S(b,'dblEchoY','Echo spacing ↑↓',{min:-0.3,max:0.3,step:0.005,fmt:x=>(x*100).toFixed(0)});
    this.S(b,'dblEchoFade','Echo fade',{min:0,max:90,step:1});
    UI.note(b,'In-camera adds the two exposures before the film, exactly like shooting twice on one frame.');
    }
    // ---------------------------------------------------------------- Light leaks
    if(want('sLeak')){
    b=UI.panel(root,'sLeak','Light Leaks',false,()=>{ this.reset(['leakAmt','leakColor','leakPos','leakSize','leakSeed']); this.clearLayer('leak'); });
    this.assetLayer(b,'leak','Scanned leaks');
    UI.note(b,'Or paint a simple procedural leak:');
    this.S(b,'leakAmt','Amount',{min:0,max:150,step:1});
    this.sel(b,'leakColor','Color',[['warm','Warm orange'],['red','Red'],['yellow','Golden'],['magenta','Magenta'],['blue','Blue'],['white','Mono (white light)']]);
    this.sel(b,'leakPos','From',[['0','Left edge'],['1','Right edge'],['2','Top'],['3','Bottom'],['4','Top-left'],['5','Top-right'],['6','Bottom-left'],['7','Bottom-right']]);
    this.S(b,'leakSize','Size',{min:5,max:120,step:1});
    { const r=document.createElement('div'); r.className='btnrow'; b.appendChild(r); UI.button(r,'🎲 New shape',()=>{ P().leakSeed=Math.round(Math.random()*99999); if(!P().leakAmt) P().leakAmt=60; H.changed(); H.commit(); UI.refresh(); });
      UI.button(r,'🎲 Random leak',()=>{ const p=P(); p.leakSeed=Math.round(Math.random()*99999); p.leakPos=Math.floor(Math.random()*8); p.leakSize=20+Math.round(Math.random()*80); p.leakAmt=40+Math.round(Math.random()*80); if(p.leakColor!=='white') p.leakColor=['warm','red','yellow','magenta','blue'][Math.floor(Math.random()*5)]; H.changed(); H.commit(); UI.refresh(); }); }
    }
    // ---------------------------------------------------------------- Burns & flares
    if(want('sBurn')){
    b=UI.panel(root,'sBurn','Film Burns & Flares',false,()=>{ this.clearLayer('burn'); this.clearLayer('flare'); });
    this.assetLayer(b,'burn','Film burns'); this.assetLayer(b,'flare','Flares & glow');
    }
    // ---------------------------------------------------------------- Dust & scratches
    if(want('sDust')){
    b=UI.panel(root,'sDust','Dust & Scratches',false,()=>{ this.reset(['dustAmt','scratchAmt','hairAmt','dustSeed','dustKind','dustOpacity','dustSize','dustSpread','scratchDir']); this.clearLayer('dust'); });
    this.assetLayer(b,'dust','Scanned dust & scratches');
    { const h=document.createElement('div'); h.className='ahead'; h.textContent='Generated dust — new every time you scatter'; b.appendChild(h); }
    { const r=document.createElement('div'); r.className='btnrow'; b.appendChild(r);
      UI.button(r,'🎲 Scatter again',()=>{ P().dustSeed=Math.round(Math.random()*99999); if(!(P().dustAmt||P().scratchAmt||P().hairAmt)) P().dustAmt=35; H.changed(); H.commit(); UI.refresh(); }); }
    this.S(b,'dustOpacity','Amount',{min:0,max:100,step:1});
    this.S(b,'dustAmt','Specks',{min:0,max:100,step:1}); this.S(b,'dustSize','Speck size',{min:40,max:250,step:1,fmt:x=>Math.round(x)+'%'});
    this.S(b,'scratchAmt','Scratches',{min:0,max:100,step:1}); this.sel(b,'scratchDir','Scratch type',[['vertical','Cinema (vertical runs)'],['random','Sleeve scuffs (any direction)']]);
    this.S(b,'hairAmt','Hairs & fibres',{min:0,max:100,step:1});
    this.sel(b,'dustSpread','Distribution',[['even','Even'],['clumps','Clumps'],['edges','Toward the edges']]);
    this.sel(b,'dustKind','Looks like',[['scan','Scanned negative (white specks)'],['print','Darkroom print (dark specks)']]);
    }
    // ---------------------------------------------------------------- Texture + frames
    if(want('sTexture')){
    b=UI.panel(root,'sTexture','Paper & Texture',false,()=>this.clearLayer('texture'));
    this.assetLayer(b,'texture','Textures');
    }
    if(want('sFrameFx')){
    b=UI.panel(root,'sFrameFx','Frames & Edges',false,()=>this.clearLayer('frame'));
    this.assetLayer(b,'frame','Frames');
    UI.note(b,'Scanned negative carriers, plate edges and print borders, laid over the edges of the photo. Instant-film frames are under Develop → Frame.');
    }
    // ---------------------------------------------------------------- Analog media
    if(want('sAnalog')){
    b=UI.panel(root,'sAnalog','Analog Media',false,()=>this.reset(AN_KEYS));
    const sub=t=>{ const h=document.createElement('div'); h.className='ahead'; h.textContent=t; b.appendChild(h); };
    const A=(k,l,o)=>this.S(b,k,l,Object.assign({min:0,max:100,step:1,set:v=>{ P()[k]=v; if(!P().anOn){ P().anOn=true; UI.refresh(); } H.changed(); }},o));
    const AS=(k,l,opts)=>UI.select(b,'st_'+k,l,()=>opts,()=>String(P()[k]),v=>{ P()[k]=v; P().anOn=true; H.changed(); H.commit(); UI.refresh(); });
    UI.check(b,'st_anOn','Analog effect on',()=>P().anOn,v=>{ P().anOn=v; H.changed(); H.commit(); });
    UI.select(b,'st_anMedium','Medium',()=>[['','Choose a medium…']].concat(ANALOG_MEDIA.map(m=>[m[0],m[1]])),()=>P().anMedium||'',v=>{ if(!v) return;
      AN_KEYS.forEach(k=>P()[k]=cloneParams(DEFAULTS[k])); Object.assign(P(),AM(v)); H.changed(); H.commit(); UI.refresh(); const m=ANALOG_MEDIA.find(x=>x[0]===v); const n=document.getElementById('anNote'); if(n) n.textContent=m[2]; });
    UI.note(b,'Pick a medium to load its full recipe, then tune any part of it.','anNote');
    sub('Signal & tape');
    A('anRes','Luma softness'); A('anLines','Line count',{max:720,step:1,fmt:x=>x?Math.round(x)+' lines':'Full'}); A('anChroma','Colour softness'); A('anShift','Colour shift',{min:-10,max:10,step:0.1,fmt:x=>x.toFixed(1)});
    A('anBleed','Colour bleed'); A('anSharp','Edge halos'); A('anGhost','Ghost / echo'); A('anGhostOff','Ghost distance',{min:0,max:100});
    A('anNoise','Luma noise'); A('anCNoise','Colour noise'); A('anSnow','Snow / static'); A('anDrop','Dropouts');
    A('anTrack','Tracking error'); A('anTrackPos','Tracking position'); A('anHead','Head-switching noise'); A('anJitter','Line jitter'); A('anInterlace','Interlace combing');
    A('anBlock','Compression blocks'); A('anSat','Saturation',{min:-100,max:100}); A('anHue','Hue drift',{min:-30,max:30,fmt:x=>Math.round(x)+'°'});
    AS('anTint','Monochrome',[['none','Colour'],['mono','Black & white'],['blue','Blue-white phosphor'],['green','Green (night vision / P1)'],['amber','Amber monitor']]);
    sub('Screen');
    A('anScan','Scanlines'); A('anScanN','Scanline count',{min:120,max:1080,step:1,fmt:x=>Math.round(x)});
    AS('anMask','Phosphor mask',[['none','None'],['aperture','Aperture grille (Trinitron)'],['shadow','Shadow mask (dot triad)'],['slot','Slot mask (arcade / TV)']]);
    A('anMaskAmt','Mask strength'); A('anCurve','Tube curvature'); A('anBloom','Phosphor glow'); A('anVig','Tube vignette'); A('anCorner','Rounded corners');
    sub('Cine gate');
    AS('anGate','Gauge',[['none','None'],['super8','Super 8'],['8mm','Standard 8mm'],['16mm','16mm'],['super16','Super 16'],['35cine','35mm cinema']]);
    A('anOverscan','Overscan (show perforations)'); A('anGateSoft','Gate softness'); A('anWeave','Gate weave'); A('anFlicker','Exposure flicker');
    sub('On-screen display');
    AS('anOSD','Overlay',[['none','None'],['vhs','VCR · PLAY + date'],['pause','VCR · PAUSE'],['rec','Camcorder · REC + battery + date'],['cctv','CCTV · camera + timestamp'],['filmdate','Film date-back (orange LED)'],['digicam','Digicam date stamp (yellow)']]);
    { const d=document.createElement('div'); d.className='sl'; d.innerHTML='<label>Custom text</label><input class="txt" placeholder="date / camera name" spellcheck="false">'; b.appendChild(d);
      const i=d.querySelector('input'); i.style.cssText='grid-column:2/4;background:#1c1c1c;border:1px solid #333;color:#ddd;border-radius:3px;padding:3px 6px;font:12px var(--sans)';
      i.value=P().anOSDText||''; i.addEventListener('keydown',e=>e.stopPropagation()); i.addEventListener('input',()=>{ P().anOSDText=i.value; P().anOn=true; H.changed(); }); i.addEventListener('change',()=>H.commit());
      UI.sliders['st_anOSDText']=()=>{ if(document.activeElement!==i) i.value=P().anOSDText||''; }; }
    UI.note(b,'Cine gauges also set grain, halation and vignette in Develop to match the film. Overlays use today\'s date unless you type your own.');
    }
    // ---------------------------------------------------------------- Lens flare
    if(want('sFlare')){
    b=UI.panel(root,'sFlare','Lens Flare',false,()=>this.reset(['flare','flareLen','flareGhost','flareColor','flareSens']));
    this.S(b,'flare','Amount',{min:0,max:100,step:1});
    this.sel(b,'flareColor','Colour',[['blue','Anamorphic blue'],['amber','Amber'],['gold','Gold'],['violet','Violet'],['teal','Teal'],['red','Red'],['green','Green'],['white','Clean white']]);
    this.S(b,'flareLen','Streak length',{min:0,max:100,step:1});
    this.S(b,'flareGhost','Ghosts',{min:0,max:100,step:1});
    this.S(b,'flareSens','Sensitivity',{min:0,max:100,step:1});
    UI.note(b,'Bright points throw a horizontal streak across the frame, like cinema anamorphic glass, plus coloured ghosts mirrored through the centre. Raise Sensitivity to make dimmer lights flare.');
    }
    // ---------------------------------------------------------------- Lens
    if(want('sLens')){
    b=UI.panel(root,'sLens','Lens Effects',false,()=>this.reset(['zoomBlur','motionBlur','motionAngle','softEdges','tiltShift','tiltPos','tiltWidth','fringe','distort']));
    this.S(b,'softEdges','Soft edges',{min:0,max:100,step:1});
    this.S(b,'fringe','Color fringing',{min:0,max:100,step:1});
    this.S(b,'distort','Distortion',{min:-80,max:60,step:1,fmt:x=>x<0?'Barrel '+Math.round(-x):x>0?'Pincushion '+Math.round(x):'0'});
    this.S(b,'zoomBlur','Zoom blur',{min:0,max:100,step:1});
    this.S(b,'motionBlur','Motion blur',{min:0,max:100,step:1}); this.S(b,'motionAngle','Motion angle',{min:-90,max:90,step:1,fmt:x=>Math.round(x)+'°'});
    this.S(b,'tiltShift','Tilt-shift blur',{min:0,max:100,step:1}); this.S(b,'tiltPos','Focus line',{min:0,max:100,step:1}); this.S(b,'tiltWidth','Focus width',{min:2,max:80,step:1});
    UI.note(b,'Judge blur and fringing at 1:1 — the preview is computed at screen size.');
    }
  },
  // what a drag on the photo moves: the double exposure, or a leak / burn / flare / dust layer
  placeTarget(){ const p=this.P(), off=p.off||{}; let t=this.dragTarget;
    if(t&&t!=='dbl'){ const Ly=(p.fx||{})[t], c=t.replace(/\d+$/,''); if(!Ly||!Ly.id||!(Ly.amt>0)||off['fx_'+c]||!['leak','burn','flare','dust'].includes(c)) t=null; }
    if(t==='dbl'&&!(p.dblId&&Engine.dblSrc&&!off.dbl)) t=null;
    if(!t){ if(p.dblId&&Engine.dblSrc&&!off.dbl) t='dbl'; else return null; }
    if(t==='dbl') return {kind:t,get:()=>({x:p.dblX||0,y:p.dblY||0,scale:p.dblScale||1,rot:p.dblRot||0}),set:o=>{ p.dblX=o.x; p.dblY=o.y; p.dblScale=o.scale; p.dblRot=o.rot; },B:Engine.dblSrc.w/Engine.dblSrc.h};
    const Ly=p.fx[t], tx=Engine.assetTex(Ly.id); if(!tx) return null;
    return {kind:t,get:()=>({x:Ly.x||0,y:Ly.y||0,scale:Ly.scale||1,rot:Ly.rot||0}),set:o=>{ Object.assign(Ly,{x:o.x,y:o.y,scale:o.scale,rot:o.rot}); },B:tx.w/tx.h}; },
  clearLayer(cat){ const p=this.P(); if(p.fx){ p.fx=Object.assign({},p.fx); Object.keys(p.fx).forEach(k=>{ if(k.replace(/\d+$/,'')===cat) delete p.fx[k]; }); } if(this.dragTarget&&this.dragTarget.replace(/\d+$/,'')===cat) this.dragTarget=null; this.host.changed(); this.host.commit(); UI.refresh(); this.refreshAssets(); },
  // a thumbnail grid of library assets + the controls for the chosen one
  // ---- layered overlays: each category can stack several layers (leak, leak2, …); 6 layers in total
  layersOf(cat){ const fx=this.P().fx||{}; return Object.keys(fx).filter(k=>k.replace(/\d+$/,'')===cat).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})); },
  totalLayers(){ const fx=this.P().fx||{}; return Object.keys(fx).filter(k=>fx[k]&&fx[k].id&&fx[k].amt>0).length; },
  selKey(cat){ this._sel=this._sel||{}; const ks=this.layersOf(cat); if(!this._sel[cat]||(!ks.includes(this._sel[cat])&&this._sel[cat]!==cat)) this._sel[cat]=ks[0]||cat; return this._sel[cat]; },
  keyLayer(key){ const p=this.P(); if(!p.fx||p.fx===DEFAULTS.fx) p.fx={}; return p.fx[key]||(p.fx[key]={id:'',amt:0}); },
  clearKey(key){ const p=this.P(); if(p.fx&&p.fx[key]){ p.fx=Object.assign({},p.fx); delete p.fx[key]; } if(this.dragTarget===key) this.dragTarget=null; this.host.changed(); this.host.commit(); UI.refresh(); this.refreshAssets(); },
  // a fresh arrangement of the same asset: quarter turns, flips, zoom into a different part of it
  shuffleLayer(key,newAsset){ const cat=key.replace(/\d+$/,''), Ly=this.keyLayer(key), R=(a,b)=>a+Math.random()*(b-a);
    if(newAsset||!Ly.id){ const l=this.assets(cat).filter(a=>a.id!==Ly.id); if(l.length) Ly.id=l[Math.floor(Math.random()*l.length)].id; if(!(Ly.amt>0)) Ly.amt=cat==='frame'?100:cat==='texture'?40:70; }
    if(cat==='frame'){ Ly.rot=Math.random()<.5?0:180; Ly.flip=Math.random()<.5; }
    else if(cat==='texture'){ Ly.scale=R(.8,1.6); Ly.rot=[0,90,180,270][Math.floor(Math.random()*4)]; Ly.flip=Math.random()<.5; }
    else { const sc=cat==='dust'?R(1,1.7):R(1,2.2); Ly.scale=sc; Ly.rot=[0,90,180,270][Math.floor(Math.random()*4)]+R(-12,12); Ly.flip=Math.random()<.5;
      const m=(sc-1)/2+0.15; Ly.x=R(-m,m); Ly.y=R(-m,m); if((cat==='leak'||cat==='flare')&&!Ly.mono) Ly.hue=Math.random()<.4?R(-40,40):0; }
    this.host.changed(); this.host.commit(); UI.refresh(); this.refreshAssets(); },
  assetLayer(b,cat,label){ const H=this.host, P=()=>this.P(), K=()=>this.selKey(cat), L=()=>this.keyLayer(K()), movable=['leak','burn','flare','dust'].includes(cat);
    const wrap=document.createElement('div'); wrap.className='alayer'; b.appendChild(wrap);
    const hd=document.createElement('div'); hd.className='ahead lhead'; wrap.appendChild(hd);
    const grid=document.createElement('div'); grid.className='agrid'; wrap.appendChild(grid);
    const ctl=document.createElement('div'); ctl.className='actl'; wrap.appendChild(ctl);
    const cur=()=>(P().fx||{})[K()]||{};
    const set=(k,v)=>{ L()[k]=v; H.changed(); };
    const sl=(k,lab,o,def)=>UI.slider(ctl,'fx_'+cat+'_'+k,lab,Object.assign({def,get:()=>{ const x=cur(); return x[k]!==undefined?x[k]:def; },set:v=>set(k,v),commit:()=>H.commit()},o));
    { const r=document.createElement('div'); r.className='btnrow'; ctl.appendChild(r);
      UI.button(r,'🎲 New pattern',()=>this.shuffleLayer(K(),false)); UI.button(r,'🎲 Different '+({leak:'leak',burn:'burn',flare:'flare',dust:'dust',texture:'texture',frame:'frame'}[cat]),()=>this.shuffleLayer(K(),true)); }
    sl('amt','Amount',{min:0,max:100,step:1},0);
    if(cat!=='frame'){ sl('scale','Scale',{min:0.3,max:4,step:0.01,fmt:x=>Math.round(x*100)+'%'},1); }
    sl('rot','Rotate',{min:-180,max:270,step:0.5,fmt:x=>x.toFixed(0)+'°'},0);
    if(['leak','burn','flare'].includes(cat)) sl('hue','Color shift',{min:-180,max:180,step:1,fmt:x=>Math.round(x)+'°',track:'linear-gradient(90deg,#3cf,#93f,#f36,#f93,#fc3,#3f9,#3cf)'},0);
    const row=document.createElement('div'); row.className='btnrow'; ctl.appendChild(row);
    UI.button(row,'Flip',()=>{ L().flip=!L().flip; H.changed(); H.commit(); });
    if(['leak','burn','flare'].includes(cat)) UI.button(row,'Mono',()=>{ L().mono=!L().mono; H.changed(); H.commit(); H.toast&&H.toast(L().mono?'Mono: white light, no colour':'Colour restored'); });
    if(cat==='dust'||cat==='frame') UI.button(row,'Invert',()=>{ L().invert=!L().invert; H.changed(); H.commit(); });
    if(movable) UI.button(row,'Place with mouse',()=>{ this.dragTarget=K(); H.changed(); H.toast&&H.toast('Drag on the photo to move it · scroll to scale · ⇧-drag to rotate'); });
    const render=()=>{ // layer tabs
      hd.innerHTML=''; const t0=document.createElement('span'); t0.textContent=label; hd.appendChild(t0);
      const ks=this.layersOf(cat); const tabs=ks.length?ks:[cat]; const sel=K();
      tabs.forEach((k,i)=>{ const t=document.createElement('button'); t.className='ltab'+(k===sel?' on':''); t.textContent=String(i+1); t.title='Layer '+(i+1); t.onclick=()=>{ this._sel[cat]=k; if(movable&&(P().fx||{})[k]) this.dragTarget=k; render(); UI.refresh(); }; hd.appendChild(t); });
      const add=document.createElement('button'); add.className='ltab add'; add.textContent='+'; add.title='Add a layer on top';
      add.onclick=()=>{ if(this.totalLayers()>=6){ H.toast&&H.toast('Up to 6 overlay layers in total'); return; } let n=1; const has=k=>(P().fx||{})[k]; let k=cat; while(has(k)) k=cat+(++n);
        this.keyLayer(k); this._sel[cat]=k; this.shuffleLayer(k,true); };
      hd.appendChild(add);
      if(ks.length>1){ const del=document.createElement('button'); del.className='ltab add'; del.textContent='×'; del.title='Remove this layer'; del.onclick=()=>this.clearKey(K()); hd.appendChild(del); }
      grid.innerHTML=''; const list=this.assets(cat), id=cur().id||'';
      const none=document.createElement('div'); none.className='atile none'+(id?'':' on'); none.innerHTML='<span>None</span>'; none.onclick=()=>this.clearKey(K()); grid.appendChild(none);
      if(!list.length){ const n=document.createElement('div'); n.className='note'; n.style.gridColumn='2/-1'; n.textContent=Engine.assetList?'No assets installed yet.':'Loading the asset library…'; grid.appendChild(n); }
      list.forEach(a=>{ const t=document.createElement('div'); t.className='atile'+(a.id===id?' on':''); t.title=a.name;
        t.innerHTML=`<img loading="lazy" src="data/assets/${a.thumb}"><span></span>`; t.querySelector('span').textContent=a.name;
        t.onclick=()=>{ const Ly=L(); if(Ly.id===a.id){ this.clearKey(K()); return; } if(!Ly.id&&this.totalLayers()>=6){ H.toast&&H.toast('Up to 6 overlay layers in total'); return; }
          Object.assign(Ly,{id:a.id,amt:Ly.amt>0?Ly.amt:(cat==='frame'?100:cat==='texture'?40:70)}); if(movable) this.dragTarget=K(); H.changed(); H.commit(); UI.refresh(); this.refreshAssets(); };
        if(H.hover){ t.onmouseenter=()=>{ const o=cloneParams(P()), k=K(); o.fx=Object.assign({},o.fx,{[k]:Object.assign({},(o.fx||{})[k]||{},{id:a.id,amt:((o.fx||{})[k]||{}).amt||(cat==='frame'?100:70)})}); H.hover(o); }; t.onmouseleave=()=>H.hover(null); }
        grid.appendChild(t); });
      ctl.style.display=id?'':'none'; };
    render(); (this._agrids=this._agrids||[]).push([grid,render]); },
  // Develop → Frame → Wet plate uses the best tintype plate from the library
  loadPlate(){ this.loadPlate0();
    // peel-apart frames for Develop → Frame → Peel-apart
    const map={peel_color:'frame_peel_fp100c',peel_bw:'frame_peel_fp3000b',peel_neg:'frame_peel_665neg'};
    for(const k in map){ const a=(Engine.assetList||[]).find(x=>x.id===map[k]); if(!a||typeof Borders==='undefined') continue;
      const im=new Image(); im.onload=()=>{ Borders.imgs[k]=im; Borders.cache.key=''; Engine.dirty=true; this.host.changed&&this.host.changed(); }; im.src='data/assets/'+a.file; } },
  loadPlate0(){ const a=(Engine.assetList||[]).find(a=>a.id==='frame_tintype_1')||(Engine.assetList||[]).find(a=>a.cat==='frame'&&/tintype|plate/i.test(a.id)); if(!a||typeof Borders==='undefined') return;
    const im=new Image(); im.onload=()=>{ Borders.plateImg=im; Borders.cache.key=''; Engine.dirty=true; this.host.changed&&this.host.changed(); }; im.src='data/assets/'+a.file; },
  refreshAssets(){ this._agrids=(this._agrids||[]).filter(([g])=>g.isConnected||!this._agridsSeen); this._agridsSeen=true; this._agrids.forEach(([g,f])=>f()); },
  // ---- 🎲 random looks: a coherent theme, then random choices inside it
  randomLook(){ const p=this.P(); if(p.dblId) this._lastDbl=p.dblId; const keep=p.dblId||this._lastDbl, R=(a,b)=>a+Math.random()*(b-a), RI=(a,b)=>Math.round(R(a,b)), pick=a=>a[Math.floor(Math.random()*a.length)], chance=x=>Math.random()<x;
    STUDIO_KEYS.forEach(k=>p[k]=cloneParams(DEFAULTS[k])); p.fx={}; p.off=Object.assign({},p.off||{}); Object.keys(p.off).forEach(k=>{ if(/^(silver|twotone|dbl|leak|dust|lensfx|fx_)/.test(k)) delete p.off[k]; });
    const lay=(cat,amt,o)=>{ const l=this.assets(cat); if(!l.length) return false; p.fx[cat]=Object.assign({id:pick(l).id,amt,rot:chance(.5)?0:RI(-25,25),flip:chance(.5),scale:R(0.9,1.6),x:R(-.2,.2),y:R(-.2,.2),hue:chance(.3)?RI(-60,60):0},o||{}); return true; };
    const themes=['analog','analog','silver','silver','toy','twotone','dreamy','burnt'].concat(keep?['double','double']:[]);
    const th=pick(themes);
    if(th==='analog'||th==='burnt'){ if(!lay('leak',RI(40,90))) { p.leakAmt=RI(40,100); p.leakColor=pick(['warm','red','yellow','magenta']); p.leakPos=RI(0,7); p.leakSize=RI(25,90); }
      if(th==='burnt'||chance(.4)) lay('burn',RI(60,100)); if(chance(.7)) lay('dust',RI(30,70),{x:0,y:0,rot:0}); else { p.dustAmt=RI(20,60); p.scratchAmt=RI(0,40); }
      if(chance(.4)) lay('texture',RI(15,40),{x:0,y:0}); if(chance(.35)) lay('frame',100,{x:0,y:0,rot:0,scale:1,hue:0});
      p.softEdges=RI(0,40); p.fringe=RI(0,30); }
    if(th==='silver'){ p.silver=true; const f=pick(FILTERS.slice(1)); p.sFilterHue=f[2]; p.sFilterAmt=RI(30,95); p.structure=RI(-20,70); p.sBurn=RI(10,60); p.sBurnSize=RI(25,60);
      p.sTone=pick(['none','selenium','sepia','gold','platinum','copper','split','cyanotype','tintype']); p.sToneAmt=RI(40,100);
      if(chance(.6)) lay('dust',RI(25,60),{x:0,y:0,rot:0,invert:chance(.5)}); if(chance(.4)) lay('texture',RI(20,45),{x:0,y:0}); if(chance(.45)) lay('frame',100,{x:0,y:0,rot:0,scale:1,hue:0}); if(chance(.2)) lay('burn',RI(40,80)); }
    if(th==='toy'){ p.softEdges=RI(40,80); p.fringe=RI(25,60); p.distort=RI(-40,-5); lay('leak',RI(30,70)); if(chance(.5)) lay('frame',100,{x:0,y:0,rot:0,scale:1,hue:0}); if(chance(.4)) p.zoomBlur=RI(10,35); }
    if(th==='twotone'){ p.ttOn=true; p.ttPalette=pick(['red-cyan','magenta-green','blue-orange','pink-blue','purple-yellow','red-blue']); p.ttGhost=RI(60,130); p.ttMono=RI(55,95); p.ttDX=R(-15,15); p.ttDY=R(-15,15); p.ttScale=RI(95,115); p.ttBand=chance(.35)?RI(20,60):0; p.ttBandPos=RI(20,80); if(chance(.4)) p.motionBlur=RI(10,40), p.motionAngle=RI(-60,60); }
    if(th==='dreamy'){ lay('flare',RI(50,90)); lay('leak',RI(30,60)); p.softEdges=RI(30,70); if(chance(.5)) p.zoomBlur=RI(5,25); p.fringe=RI(10,40); }
    if(th==='double'){ p.dblId=keep; p.dblMode=pick(['add','screen','lighten','silhouette']); p.dblAmt=RI(50,100); p.dblScale=R(0.9,1.8); p.dblX=R(-.25,.25); p.dblY=R(-.2,.2); p.dblRot=chance(.6)?0:RI(-30,30); p.dblFlip=chance(.4); if(chance(.5)) p.silver=true, p.sTone=pick(['none','selenium','sepia']); if(chance(.5)) lay('leak',RI(30,60)); this.dragTarget='dbl'; }
    else { p.dblId=''; Engine.setDouble(null); }
    if(th==='double'&&this.host.loadDouble) this.host.loadDouble().then(()=>{ Engine.dirty=true; });
    this.host.changed(); this.host.commit(); UI.refresh(); this.refreshAssets(); this.host.toast&&this.host.toast('🎲 '+{analog:'Analog accident',silver:'Silver print',toy:'Toy camera',twotone:'Two-tone flash',dreamy:'Dreamy flare',burnt:'Burnt roll',double:'Double exposure'}[th]+' — press again for another (⌘Z to undo)'); },
  // recipes as a Nik-style grid of live previews of the current photo
  buildRecipeGrid(el,onHover){ el.innerHTML=''; el.classList.add('rgrid'); this._rtiles=[];
    let grp=''; STUDIO_RECIPES.forEach(([name,r])=>{ const [g,n]=name.includes(' · ')?name.split(' · '):['',name]; if(g!==grp){ grp=g; const h=document.createElement('div'); h.className='rgroup'; h.textContent=g; el.appendChild(h); }
      const d=document.createElement('div'); d.className='rtile'; d.innerHTML='<div class="rim"></div><span></span>'; d.querySelector('span').textContent=n;
      d.onclick=()=>this.applyRecipe(r,name); if(onHover){ d.onmouseenter=()=>onHover(this.recipeParams(r)); d.onmouseleave=()=>onHover(null); } el.appendChild(d); this._rtiles.push([d,r]); }); },
  // render the previews a few at a time so the UI stays responsive
  refreshRecipeThumbs(key){ if(!this._rtiles||!this.host.renderThumb||!Engine.src) return; if(key&&key===this._rkey) return; this._rkey=key; const job=this._rjob=(this._rjob||0)+1; let i=0;
    const step=()=>{ if(job!==this._rjob) return; const t0=performance.now();
      while(i<this._rtiles.length&&performance.now()-t0<24){ const [d,r]=this._rtiles[i++]; const u=this.host.renderThumb(this.recipeParams(r),220); if(u) d.querySelector('.rim').style.backgroundImage=`url(${u})`; }
      if(i<this._rtiles.length) setTimeout(step,16); };
    setTimeout(step,60); },
  buildRecipes(el,onHover){
    el.innerHTML='';
    STUDIO_RECIPES.forEach(([name,r])=>{ const d=document.createElement('div'); d.className='preset recipe'; d.textContent=name;
      d.onclick=()=>this.applyRecipe(r,name); if(onHover){ d.onmouseenter=()=>onHover(this.recipeParams(r)); d.onmouseleave=()=>onHover(null); } el.appendChild(d); });
  },
};
