//// require jsxgraphcore.js, jsxgraph.css, katex.min.js, katex-auto-render.min.js, katex.min.css
(function (root, factory) {
    root.SWMathGraph = factory();
}(this, function () {
    const g_id_jxgboxDiv = "swmathbox";
    const g_id_outputDiv = "swmath_output";
    const g_id_imageCanvas = "canvas_swmathimage";
    const g_id_jsxgraph_table = "swmathgraph_table";
    const g_id_tr_jxgbox = "tr_swmathbox";
    const g_id_td_jxgbox = "td_swmathbox";
    const g_id_tr_output = "tr_swmath_output";
    const g_id_td_output = "td_swmath_output";
    const g_id_jsximage_table = "table_swmathimage";
    const g_id_tr_jsximage = "tr_swmathimage";
    const g_id_td_jsximage = "td_swmathimage";
    const g_id_combine_iframe = "swmath_combine_iframe";
    const g_id_with_katex_css = "swmath_with_katex_css";

    var instance_index = 0;
    var current_instance_id = "000";
    var instance_pool = {};
    var panel_ready = false;

    function generateID() {
        var id = ""+instance_index;
        for (var i=0;i<3;i++) {if(id.length>=3) break; id = "0"+id;}
        instance_index++;
        return id;
    }
    function addInstancePool(inst) {instance_pool[inst.id] = inst.instance;}
    function setCurrentInstance(instance){current_instance_id = instance.instance_id;}

    //// debug flag and debug level
    //// debug: true / false,
    //// debug: {level: "verbose"}, // "fatal","warning","info","debug","verbose"
    var f_debug = false;
    function log(...args){ // verbose, variant-length argument function
      if (f_debug && (typeof(f_debug) == "boolean" || typeof(f_debug) == "object" && f_debug.level in ["verbose"])){
        console.log(...args);
      }
    }
    function log_debug(...args){ // debug
      if (f_debug && (typeof(f_debug) == "boolean" || typeof(f_debug) == "object" && f_debug.level in ["debug","verbose"])){
        console.log(...args);
      }
    }
    function log_info(...args){ // info
      if (f_debug && (typeof(f_debug) == "boolean" || typeof(f_debug) == "object" && f_debug.level in ["info","debug","verbose"])){
        console.log(...args);
      }
    }
    function log_warn(...args){ // warning
      if (f_debug && (typeof(f_debug) == "boolean" || typeof(f_debug) == "object" && f_debug.level in ["warning","info","debug","verbose"])){
        console.warn(...args);
      }
    }
    function log_error(...args){ // error
      if (f_debug && (typeof(f_debug) == "boolean" || typeof(f_debug) == "object" && f_debug.level in ["error","warning","info","debug","verbose"])){
        console.error(...args);
      }
    }
    function log_fatal(...args){ // fatal
      if (f_debug && (typeof(f_debug) == "boolean" || typeof(f_debug) == "object" && f_debug.level in ["fatal","error","warning","info","debug","verbose"])){
        console.error(...args);
      }
    }

    function checkAndCreateHTMLElement(type, id, parent_id, class_name, style, pool, add_id_flag){
      var parent = parent_id == 'body'?document.body:document.querySelector('#'+parent_id);
      if(!parent){log_error("HTMLElement: parent_id no found:", parent_id); return;}
      if(!id || ! (/^[a-zA-Z0-9_]+$/.test(id))){log_error("HTMLElement: id is invalid:", id); return;}
      if(!type || ! (['div','span','table','tr','td','textarea','iframe','button','input','label','canvas'].includes(type))){log_error("HTMLElement: type is not supported here:", type); return;}
      var aDiv = document.querySelector('#'+id);
      if (!aDiv) {
        aDiv = document.createElement(type); // div, span, table, tr, td, textarea, iframe, button, label, input, canvas
        aDiv.id = id;
        if(class_name && (/^[a-zA-Z0-9_]+$/.test(class_name))) aDiv.className = class_name;
        if(style && typeof(style)=="object" && style.width && (/^[a-zA-Z0-9_%]+$/.test(style.width))) aDiv.style.width = style.width;
        if(style && typeof(style)=="object" && style.height && (/^[a-zA-Z0-9_%]+$/.test(style.height))) aDiv.style.height = style.height;
        if(style && typeof(style)=="object" && style.overflowY && (/^[a-zA-Z0-9_]+$/.test(style.overflowY))) aDiv.style.overflowY = style.overflowY;
        if(style && typeof(style)=="object" && style.border && (/^[a-zA-Z0-9_]+$/.test(style.border))) aDiv.style.border = style.border;
        parent.appendChild(aDiv);
      }
      if (pool && pool instanceof Array) if(add_id_flag) pool.push(id); else pool.push(aDiv);
      return aDiv;
    }

    function checkAndCreateJxgbox(self, id, parent_id){
        checkAndCreateHTMLElement('div', id, parent_id, self.options.panelClassName, {width:self.panelWidth, height:self.panelHeight}, self.jxgbox_pool);
    }

    function checkAndCreateOutput(self, id, parent_id){
        checkAndCreateHTMLElement('textarea', id, parent_id, null, {width:self.panelWidth, height:self.panelHeight, overflowY:"auto"}, self.output_pool, true);
    }

    function checkAndCreateJxgboxParentTd(self,id, parent_id){
        if (!parent_id) {parent_id = g_id_tr_jxgbox;}
        checkAndCreateHTMLElement('td', id, parent_id);
    }

    function checkAndCreateOutputParentTd(self, id, parent_id){
        if (!parent_id) {parent_id = g_id_tr_output;}
        checkAndCreateHTMLElement('td', id, parent_id);
    }

    function checkAndCreateJsximageParentTd(self, id, parent_id){   
        if (!parent_id) {parent_id = g_id_tr_jsximage;}
        checkAndCreateHTMLElement('td', id, parent_id);
    }

    function checkAndCreateJsximageCanvas(self, id, parent_id){
        checkAndCreateHTMLElement('canvas', id, parent_id, null, {width:self.panelWidth, height:self.panelHeight});
    }

    function checkAndCreateToolBarBtn(id, parent_id, innerHTML, onclick){
        if (!parent_id) {parent_id = "swmathgraph_m_toolbar";}
        var parent = parent_id == 'body'?document.body:document.querySelector('#'+parent_id);
        var aBtn = document.getElementById(id);
        if(!aBtn) {
            aBtn = document.createElement("button");
            aBtn.id = id;
            aBtn.onclick = onclick; // self.on_convert_to_image_display;
            aBtn.innerHTML = innerHTML; // "Convert to image display";
            parent.appendChild(aBtn);
            var aSpan = document.createElement("span");
            aSpan.innerHTML = "&nbsp;&nbsp;";
            parent.append(aSpan);
        }
    }

    function checkAndCreateToolBarCheckbox(id, parent_id, innerHTML){
        if (!parent_id) {parent_id = "swmathgraph_m_toolbar";}
        var parent = parent_id == 'body'?document.body:document.querySelector('#'+parent_id);

        var aCheckbox = document.getElementById(id);
        if(!aCheckbox) {
            aCheckbox = document.createElement("input");
            aCheckbox.id = id;
            aCheckbox.type = "checkbox";
            parent.appendChild(aCheckbox);
            var aLabel = document.createElement("label");
            aLabel.innerHTML = innerHTML;
            parent.appendChild(aLabel);
        }
    }

    function checkAndCreatePanels(self, oneDiv) {
        if (panel_ready) {return;}

        var displayPanelDiv, imagePanelDiv, toolbarPanelSpan, combinePanelDiv;
        var aDiv;
        if(oneDiv && typeof(oneDiv) == "string") { // div ID
            var divID = oneDiv;
            aDiv = document.getElementById(divID);
            if (aDiv) {
                displayPanelDiv = aDiv;
            }
        }
        else if(oneDiv && typeof(oneDiv) == "object" && oneDiv.nodeType == 1) { // HTMLElement
            displayPanelDiv = oneDiv;
        }

        //// displayPanel
        if(!displayPanelDiv) {
            displayPanelDiv = checkAndCreateHTMLElement('div','swmathgraph_display_panel','body');
        }

        //diplayPanel - table
        checkAndCreateHTMLElement('table','swmathgraph_table','swmathgraph_display_panel');
        checkAndCreateHTMLElement('tr','tr_swmathbox','swmathgraph_table');
        checkAndCreateJxgboxParentTd(self, 'td_swmathbox');
        checkAndCreateJxgbox(self, 'swmathbox', 'td_swmathbox');

        checkAndCreateHTMLElement('tr','tr_swmath_output','swmathgraph_table');
        checkAndCreateOutputParentTd(self, 'td_swmath_output');
        checkAndCreateOutput(self, 'swmath_output', 'td_swmath_output');

        //// toolbarPanel
        toolbarPanelSpan = checkAndCreateHTMLElement('span','swmathgraph_m_toolbar','swmathgraph_display_panel');
        // toolbarPanel buttons
        checkAndCreateToolBarBtn('swmath_toolbar_btn_imgdisp','swmathgraph_m_toolbar',"Convert to Image Display",onclick=self.on_convert_to_image_display);
        checkAndCreateToolBarBtn('swmath_toolbar_btn_comdisp','swmathgraph_m_toolbar',"Merge Display",onclick=self.on_combine_display);
        checkAndCreateToolBarBtn('swmath_toolbar_btn_copy','swmathgraph_m_toolbar',"Copy Merged HTML",onclick=self.on_combine_copy_HTML);
        checkAndCreateToolBarCheckbox('swmath_with_katex_css','swmathgraph_m_toolbar','with katex.css');

        //// imagePanel
        imagePanelDiv = checkAndCreateHTMLElement('div','swmathgraph_image_panel','swmathgraph_display_panel');

        // imagePanel - table
        aDiv = document.createElement("div");
        aDiv.innerHTML = "<br>"
        imagePanelDiv.appendChild(aDiv);

        checkAndCreateHTMLElement('table','table_swmathimage','swmathgraph_image_panel');
        checkAndCreateHTMLElement('tr','tr_swmathimage','table_swmathimage');
        checkAndCreateJsximageParentTd(self, 'td_swmathimage');
        
        //// combinePanel
        checkAndCreateHTMLElement('div','swmathgraph_svg_combine_panel','swmathgraph_display_panel');

        // combinePanel - iframe
        checkAndCreateHTMLElement('iframe','swmath_combine_iframe','swmathgraph_svg_combine_panel', null, {width:"100%", height:"800px", border:"0"});

        // console.log("displayPanelDiv.outerHTML:",displayPanelDiv.outerHTML);

        panel_ready = true; // just check and create panels once
    }

    function sleep_ms(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    async function wait_ms(ms) {
        await sleep_ms(ms); // wait for ms milliseconds
    }
    

    function deepCopy(obj, obj2, toLower) {
      var c = {};
      var c, i, prop, i2;
 
      toLower = toLower || false;
      if (typeof obj !== 'object' || obj === null) {
          return obj;
      }

      // Missing hasOwnProperty is on purpose in this function
      if (obj instanceof Array) {
          c = [];
          for (i = 0; i < obj.length; i++) {
              prop = obj[i];
              // Attention: typeof null === 'object'
              if (prop !== null && typeof prop === "object") {
                  // We certainly do not want to recurse into a JSXGraph object.
                  // This would for sure result in an infinite recursion.
                  // As alternative we copy the id of the object.
                  if (prop.board) {
                      c[i] = prop.id;
                  } else {
                      c[i] = deepCopy(prop, {}, toLower);
                  }
              } else {
                  c[i] = prop;
              }
          }
      } else {
          c = {};
          for (i in obj) {
              if (obj.hasOwnProperty(i)) {
                  i2 = toLower ? i.toLowerCase() : i;
                  prop = obj[i];
                  if (prop !== null && typeof prop === "object") {
                      if (prop.board) {
                          c[i2] = prop.id;
                      } else {
                          c[i2] = deepCopy(prop, {}, toLower);
                      }
                  } else {
                      c[i2] = prop;
                  }
              }
          }

          for (i in obj2) {
              if (obj2.hasOwnProperty(i)) {
                  i2 = toLower ? i.toLowerCase() : i;

                  prop = obj2[i];
                  if (prop !== null && typeof prop === "object") {
                      if (prop instanceof Array || !c[i2]) {
                          c[i2] = deepCopy(prop, {}, toLower);
                      } else {
                          c[i2] = deepCopy(c[i2], prop, toLower);
                      }
                  } else {
                      c[i2] = prop;
                  }
              }
          }
      }
      return c;
    }

    //// attributes
    var g_fontSize = 10;
    var xlabelPosition = { useKatex:true, position: 'rt',offset: [-1, 20], };
    var ylabelPosition = { useKatex:true, position: 'rt',offset: [10, 8],};
    var xAxisLabel = {name:'x', withLabel: true, label:xlabelPosition, };
    var yAxisLabel = {name:'y', withLabel: true, label:ylabelPosition};

    var ticksWithoutGrid = { visible: true, majorHeight: 5, ticksPerLabel:10, };
    var ticksInvisible = { visible: false, majorHeight: 5, ticksPerLabel:10, };
    var pointStyle = {size:0.5, strokeColor:'black'};
    var lineStyle = {strokeWidth:1, strokeColor:'black'};
    var lineStyleWithName = {strokeWidth:1, strokeColor:'black', withLabel:true, label:{fontSize:g_fontSize, color:"black", useKatex:true}};
    var dashLineStyle = {dash:1, strokeWidth:1, strokeColor:'black'};
    var curveStyle = {strokeWidth:1, strokeColor:'black'};
    var curveStyleWithName = {strokeWidth:1, strokeColor:'black', withLabel:true, label:{fontSize:g_fontSize, color:"black", useKatex:true}};
    var angleStyle = {...curveStyle, radius:0.5, name:'',
              anglePoint: {visible:false}, center: {visible: false}, radiusPoint: {visible: false},
              fillColor: 'white', strokeColor: 'black'
    };
    var polygonStyle = {strokeWidth:1, strokeColor:'black', borders:{strokeColor:"black"}, withLines:false,fillColor:"#C0D966",vertices: {withLabel: false}};
    var polygonStyleWithName = {strokeWidth:1, strokeColor:'black', borders:{strokeColor:"black"}, withLabel:true, label:{fontSize:g_fontSize, color:"black", useKatex:true}, withLines:false,fillColor:"#C0D966",vertices: {withLabel: false}};
    var angleStyleWithName = {...angleStyle, withLabel:true, label:{fontSize:g_fontSize, color:"black", useKatex:true}};
    var arcLastArrowStyle = {arc:{visible:true,strokeWidth:1,lastArrow:{type:1}, strokeColor:'black'}};
    var funcStyleWithName = {withLabel: true, label:{fontSize:g_fontSize, useKatex:true, position:"rt",}};
    var tickPointStyle = {
          // x:{strokeColor: '#000000', majorHeight: 5, drawLabels: true, label:{anchorX:'middle', offset:[0,-10]},},
          // y:{strokeColor: '#000000', majorHeight: 5, drawLabels: true, label:{anchorX:'middle', offset:[-14,0]},},
          x:{strokeColor: '#000000', majorHeight: 5, drawLabels: true, label:{offset:[0,-10]},},
          y:{strokeColor: '#000000', majorHeight: 5, drawLabels: true, label:{offset:[-20,-2]},},
    };
    var pointLabelPosition = {
          leftTop:{anchorX:'middle',anchorY:'middle', offset:[-10,10],},
          leftBottom:{anchorX:'middle',anchorY:'middle', offset:[-10,-10],},
          rightTop:{anchorX:'middle',anchorY:'middle', offset:[10,10],},
          rightBottom:{anchorX:'middle',anchorY:'middle', offset:[10,-10],},
          middleTop:{anchorX:'middle',anchorY:'middle', offset:[0,10],},
          middleBottom:{anchorX:'middle',anchorY:'middle', offset:[0,-10],},
          leftMiddle:{anchorX:'middle',anchorY:'middle', offset:[-10,0],},
          rightMiddle:{anchorX:'middle',anchorY:'middle', offset:[10,0],},
          middle:{anchorX:'middle',anchorY:'middle', offset:[0,0],},
    };

    ////
    function check_vn(vn){return /^[a-zA-Z][a-zA-Z0-9_]*$/.test(vn);}
    function vnTypeOf(vns){var arr = vns.split('.'); if(arr.length==2){return arr[0];}else{return "";}};
    function vnTypePair(vns){var arr = vns.split('.'); if(arr.length==2){return {type:arr[0], vn:arr[1]};}else{return null;}};
    function ref(vns){var inst = instance_pool[current_instance_id];var i = inst.g_index; var f = function (pvns){if(pvns&&typeof(pvns)=="string") {vns=pvns+"."+vns;} ; return inst.g_V[i][vns];};f.type="ref"; return f;}
    // function ref(vns){var inst = instance_pool[current_instance_id];var i = inst.g_index; console.log("current_instance_id:",current_instance_id,", inst:",inst,",i:",i,",vns:",vns); var f = function (pvns){if(pvns&&typeof(pvns)=="string") {vns=pvns+"."+vns;} console.log("pvns:",pvns,",vns:",vns);return inst.g_V[i][vns];};f.type="ref"; return f;}
    ////
    
    function create_point(board, p){
      if(!p){return null;}
      var jsxOb = null;
      var attrs = {label:{...pointLabelPosition.leftBottom,useKatex:true,}, ...pointStyle,};
          var tmpa = {};
          if (p instanceof Array){
            if (p.length < 2) {return null;}
            attrs.name = p[2]?''+p[2]:'';
            tmpa = {label:{useKatex:true}};
            tmpa.label = p[3] && typeof(p[3]) == "object" && pointLabelPosition[p[3].pos]?{...tmpa.label, ...pointLabelPosition[p[3].pos]}:tmpa.label;
            attrs = deepCopy(attrs, tmpa, true);
            jsxOb = board.create('point', [p[0],p[1]], attrs);
          }
          else if(typeof(p) == "object" && p.p){
            if (! p.p instanceof Array || p.p.length < 2) {return null;}
            attrs.name = p.p[2]?''+p.p[2]:'';
            attrs = p.a && typeof (p.a) == "object"?deepCopy(attrs, p.a, true):attrs;
            jsxOb = board.create('point', [p.p[0],p.p[1]], attrs);
          }
      return jsxOb;
    }

    function create_line(board, l){
      if(!l){return null;}
      var jsxOb = null;
        var attrs = deepCopy(lineStyle);;
          var tmpa = undefined;
          var pts = [];
          if (l instanceof Array){
            if(l.length<2){return null;}
            l.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){l[i]=e();}}); // handle ref
            pts = [l[0], l[1]];
            pts = l.length > 2 && typeof(l[2]) != "object"?[l[0], l[1], l[2]]:pts;
            var lastl = l[l.length-1];
            tmpa = l.length > 2 && typeof(lastl) == "object" && !( lastl instanceof Array) ?lastl:tmpa;
            attrs = tmpa && tmpa.name?deepCopy(lineStyleWithName):attrs;
            attrs = tmpa?deepCopy(attrs, tmpa, true):attrs;
            jsxOb = board.create('line', pts, attrs);
          }
          else if(typeof(l) == "object" && l.l){
            if(l.l.length<2){return null;}
            l.l.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){l.l[i]=e();}}); // handle ref
            pts = [l.l[0], l.l[1]];
            pts = l.l.length > 2 && typeof(l.l[2]) != "object"?[l.l[0], l.l[1], l.l[2]]:pts;
            attrs = l.a && typeof (l.a) == "object" && l.a.name?deepCopy(lineStyleWithName):attrs;
            attrs = l.a && typeof (l.a) == "object"?deepCopy(attrs, l.a, true):attrs;
            jsxOb = board.create('line', pts, attrs);
          }
      return jsxOb;
    }

    function create_segment(board, sl){
      if(!sl){return null;}
      var jsxOb = null;
        var attrs = deepCopy(lineStyle);
        // Object.assign(attrs, lineStyle);
          var tmpa = undefined;
          var pts = [];
          if (sl instanceof Array){
            if(sl.length<2){return null;}
            sl.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){sl[i]=e();}}); // handle ref
            pts = [sl[0], sl[1]];
            pts = sl.length > 2 && typeof(sl[2])!="object" ? [sl[0], sl[1], sl[2]]:pts;
            var lastl = sl[sl.length-1];
            tmpa = sl.length > 2 && typeof(lastl) == "object" && !( lastl instanceof Array) ?lastl:tmpa;
            attrs = tmpa && tmpa.name?deepCopy(lineStyleWithName):attrs;
            attrs = tmpa?deepCopy(attrs, tmpa, true):attrs;
            jsxOb = board.create('segment', pts, attrs);
          }
          else if(typeof(sl) == "object" && sl.sl){
            if(sl.sl.length<2){return null;}
            sl.sl.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){sl.sl[i]=e();}}); // handle ref
            pts = [sl.sl[0], sl.sl[1]];
            pts = sl.sl.length > 2 && typeof(sl.sl[2])!="object" ? [sl.sl[0], sl.sl[1], sl.sl[2]]:pts;
            attrs = sl.a && typeof (sl.a) == "object" && sl.a.name?deepCopy(lineStyleWithName):attrs;
            attrs = sl.a && typeof (sl.a) == "object"?deepCopy(attrs, sl.a, true):attrs;
            jsxOb = board.create('segment', pts, attrs);
          }
      return jsxOb;
    }

    //// Angle: there 2 types of definition.
    //// pts:[point1,point2,point3], the angle is at the point2. Counterclockwise from point1 to point3.
    //// pts:[line1, line2 , direction1, direction2], the angle is at the cross point of two lines.
    ////     direction1, which could be a coordinate like [1,1] or a number like 1 (-1), represents the half line direction of line1.
    ////     direction2, which could be a coordinate like [1,1] or a number like 1 (-1), represents the half line direction of line2.
    ////     If the direction is a coordinate, it will compare to the cross point of two lines and determine it represents which half line for a line.
    ////     If the direction is a number, it will compare to both the start point and the end point of the line and determine it represents which half line for a line.
    ////     The number -1 means the half of the line is at the start point side , otherwise the number 1 means the half of the line is at the end point side.
    ////
    function create_angle(board, ag){
      if(!ag){return null;}
      var jsxOb = null;
        var attrs = deepCopy(angleStyle);
          var tmpa = undefined;
          var pts = [];
          if (ag instanceof Array){
            if(ag.length<3){return null;}
            ag.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){ag[i]=e();}}); // handle ref
            pts = [ag[0], ag[1], ag[2]];
            pts = ag.length > 3 && typeof(ag[0])=="object" && ag[0].elType=="line"?[ag[0], ag[1], ag[2], ag[3]]:pts;
            var lastl = ag[ag.length-1];
            tmpa = ag.length > 2 && typeof(lastl) == "object" && !( lastl instanceof Array) ?lastl:tmpa;
            attrs = tmpa && tmpa.name?deepCopy(attrs,angleStyleWithName):attrs;
            attrs = tmpa && tmpa.arcLastArrow?deepCopy(attrs,arcLastArrowStyle):attrs;
            attrs = tmpa?deepCopy(attrs, tmpa, true):attrs;
            jsxOb = board.create('angle', pts, attrs);
            
            // make the new point auto-created invisile. jsxOb.point3.visProp.visible = false;
            // [jsxOb.point1,jsxOb.point2,jsxOb.point3].forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp.visible=false;}});
            [jsxOb.point1,jsxOb.point2,jsxOb.point3].forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp={};jp.rendNode.setAttribute('fill-opacity',0);jp.rendNode.setAttribute('stroke-opacity',0);}});
          }
          else if(typeof(ag) == "object" && ag.ag){
            if(ag.ag.length<3){return null;}
            ag.ag.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){ag.ag[i]=e();}}); // handle ref
            pts = [ag.ag[0], ag.ag[1], ag.ag[2]];
            pts = ag.ag.length > 3 && typeof(ag.ag[0])=="object" && ag.ag[0].elType=="line"?[ag.ag[0], ag.ag[1], ag.ag[2], ag.ag[3]]:pts;
            attrs = ag.a && typeof (ag.a) == "object" && ag.a.name?deepCopy(attrs,angleStyleWithName):attrs;
            attrs = ag.a && typeof (ag.a) == "object" && ag.a.arcLastArrow?deepCopy(attrs,arcLastArrowStyle):attrs;
            attrs = ag.a && typeof (ag.a) == "object"?deepCopy(attrs, ag.a, true):attrs;
            jsxOb = board.create('angle', pts, attrs);
            [jsxOb.point1,jsxOb.point2,jsxOb.point3].forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp={};jp.rendNode.setAttribute('fill-opacity',0);jp.rendNode.setAttribute('stroke-opacity',0);}});
            // [jsxOb.point1,jsxOb.point2,jsxOb.point3].forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp.visible=false;}});
          }
      return jsxOb;
    }

    function create_polygon(board, pg){
      if(!pg){return null;}
      var jsxOb = null;
        var attrs = deepCopy(polygonStyle);
          var tmpa = undefined;
          var pts = [];
          if (pg instanceof Array){
            if(pg.length<3){return null;}
            pg.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){pg[i]=e();}}); // handle ref
            for (e of pg) {if(typeof(e)=="object" && (e instanceof Array || e.elType)){pts.push(e);}else break;}

            var lastl = pg[pg.length-1];
            tmpa = pg.length > 3 && typeof(lastl) == "object" && !( lastl instanceof Array || lastl.elType) ?lastl:tmpa;
            attrs = tmpa && tmpa.name?deepCopy(attrs,polygonStyleWithName):attrs;
            attrs = tmpa?deepCopy(attrs, tmpa, true):attrs;

            jsxOb = board.create('polygon', pts, attrs);

            // make the new point auto-created invisile. jsxOb.point3.visProp.visible = false;
            jsxOb.vertices.forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp={};jp.rendNode.setAttribute('fill-opacity',0);jp.rendNode.setAttribute('stroke-opacity',0);}});

            // jsxOb.vertices.forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp={};jp.rendNode.setAttribute('fill-opacity',0);jp.rendNode.setAttribute('stroke-opacity',0);}});
            // jsxOb.vertices.forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp={};jp.rendNode.setAttribute('fill-opacity',0);jp.rendNode.setAttribute('stroke-opacity',0);console.log("jp.rendNode:",jp.rendNode);}}); //jp.rendNode.outerHTML="";fill-opacity
            // jsxOb.vertices.forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp.visible=false;jp.visProp.size=0;}});
            // [jsxOb.point1,jsxOb.point2,jsxOb.point3].forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp.visible=false;}});
          }
          else if(typeof(pg) == "object" && pg.pg){
            if(pg.pg.length<3){return null;}
            pg.pg.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){pg.pg[i]=e();}}); // handle ref
            for (e of pg.pg) {if(typeof(e)=="object" && (e instanceof Array || e.elType)){pts.push(e);}else break;}
            attrs = pg.a && typeof (pg.a) == "object" && pg.a.name?deepCopy(attrs,polygonStyleWithName):attrs;
            attrs = pg.a && typeof (pg.a) == "object"?deepCopy(attrs, pg.a, true):attrs;
            jsxOb = board.create('polygon', pts, attrs);
            jsxOb.vertices.forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp={};jp.rendNode.setAttribute('fill-opacity',0);jp.rendNode.setAttribute('stroke-opacity',0);}});

            // jsxOb.vertices.forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp.visible=false;jp.visProp.size=0;}});
            // [jsxOb.point1,jsxOb.point2,jsxOb.point3].forEach((jp) =>{if(jp.visProp.size == 3 && jp.visProp.visible){jp.visProp.visible=false;}});
          }
      return jsxOb;
    }

    function create_ellipse(board, elp){
      if(!elp){return null;}
      var jsxOb = null;
        var attrs = deepCopy(lineStyle);
          var tmpa = undefined;
          var pts = [];
          if (elp instanceof Array){
            if(elp.length<3){return null;}
            elp.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){elp[i]=e();}}); // handle ref
            for (e of elp) {if(typeof(e)=="object" && (e instanceof Array || e.elType)){pts.push(e);}else break;}

            var lastl = elp[elp.length-1];
            tmpa = elp.length > 3 && typeof(lastl) == "object" && !( lastl instanceof Array || lastl.elType) ?lastl:tmpa;
            attrs = tmpa && tmpa.name?deepCopy(attrs,lineStyleWithName):attrs;
            attrs = tmpa?deepCopy(attrs, tmpa, true):attrs;
            jsxOb = board.create('ellipse', pts, attrs);
          }
          else if(typeof(elp) == "object" && elp.elp){
            if(elp.elp.length<3){return null;}
            elp.elp.forEach((e,i) => {if(typeof(e)=="function" && e.type == "ref"){elp.elp[i]=e();}}); // handle ref
            for (e of elp.elp) {if(typeof(e)=="object" && (e instanceof Array || e.elType)){pts.push(e);}else break;}
            attrs = elp.a && typeof (elp.a) == "object" && elp.a.name?deepCopy(attrs,lineStyleWithName):attrs;
            attrs = elp.a && typeof (elp.a) == "object"?deepCopy(attrs, elp.a, true):attrs;
            jsxOb = board.create('ellipse', pts, attrs);
          }
      return jsxOb;
    }

    function create_inequality(board, ine) {
      if(!ine){return null;}
      var jsxOb = null;
        var attrs = deepCopy(lineStyle);
          if (ine instanceof Array){
            if(ine.length<1){return null;}
            if (ine.length>=2 && ine[1] && typeof(ine[1])=="object") {attrs = deepCopy(attrs,ine[1]);}
            jsxOb = board.create('inequality', [...ine[0]], attrs);
          }
            
      return jsxOb;
    }

    function create_curveintersection(board, soi) {
      if(!soi){return null;}
      var jsxOb = null;
        var attrs = deepCopy(lineStyle);
          if (soi instanceof Array){
            if(soi.length<1 || soi[0].length != 2 || !soi[0][0] || !soi[0][1]){return null;}
            if (soi.length>=2 && soi[1] && typeof(soi[1])=="object") {attrs = deepCopy(attrs,soi[1]);}
            jsxOb = board.create('curveintersection', [...soi[0]], attrs);
          }
            
      return jsxOb;
    }

    function create_curveunion(board, sou) {
      if(!sou){return null;}
      var jsxOb = null;
        var attrs = deepCopy(lineStyle);
          if (sou instanceof Array){
            if(sou.length<1 || sou[0].length != 2 || !sou[0][0] || !sou[0][1]){return null;}
            if (sou.length>=2 && sou[1] && typeof(sou[1])=="object") {attrs = deepCopy(attrs,sou[1]);}
            jsxOb = board.create('curveunion', [...sou[0]], attrs);
          }
            
      return jsxOb;
    }

    function create_curvedifference(board, soc) {
      if(!soc){return null;}
      var jsxOb = null;
        var attrs = deepCopy(lineStyle);
          if (soc instanceof Array){
            if(soc.length<1 || soc[0].length != 2 || !soc[0][0] || !soc[0][1] ){return null;}
            if (soc.length>=2 && soc[1] && typeof(soc[1])=="object") {attrs = deepCopy(attrs,soc[1]);}
            jsxOb = board.create('curvedifference', [...soc[0]], attrs);
          }
            
      return jsxOb;
    }

    function rotate_point(p, cp, rotation) {
      if (rotation == 0 || rotation == 2*Math.PI || rotation == -2*Math.PI) {return p;}
      // A is angle of a line of a point and center point comparing to horizontal line or x axis.
      // B is the rotation angle
      //cos(A+B) = cosA cosB - sinA sinB
      //sin(A+B) = sinA cosB + cosA sinB
      var x = p[0] - cp[0];
      var y = p[1] - cp[1];
      var r = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
      var sinA = y/r;
      var cosA = x/r;
      var sinB = Math.sin(rotation);
      var cosB = Math.cos(rotation);
      var sinA_B = sinA * cosB + cosA * sinB;
      var cosA_B = cosA * cosB - sinA * sinB;

      return [cp[0] + r*cosA_B, cp[1] + r*sinA_B];
    }

    ////
    //// {
    ////   venns:{
    ////     U:[cpointArray[], wscale, hscale, attrsObject{}, {vn:varName}], 
    ////     sets:[ [cpointOffsetArray[], wscale, hscale, attrsObject{}, {vn:varName}], ... ],
    ////     ops:[ [operationName:'i'|'u'|'c', setRefFuncArray[], attrsObject{}, {vn:varName}], ... ]
    ////   }
    //// }
    //// set ops includes i:intersection, u:union, c:complement, and the set elements must be a ref function.
    ////
    //// For example:
    ////
    //// var graph_venn1 = {  boundingbox: [-5, 5, 5, -5], axis: false,
    ////   venns: [
    ////     {
    ////       U:[[0,0], 1.0, 0.5, {name:"U", label:{offset:[-85,-35]}}], // default fillOpacity:0, default fillColor:"#C0D966"
    ////       sets:[
    ////         [[-1.5,0 ], 0.6,0.7,{name:"A", label:{offset:[45,5]}},{vn:"A"}],  
    ////         [[2.0,0], 0.4,0.8, {name:"B", label:{offset:[45,5]}},{vn:"B"}],
    ////       ],
    ////       ops: [ 
    ////         ['c',[ref('set.B')],{},{vn:"o_cB"}],
    ////         ['i',[ref('set.A'), ref('op.o_cB')],{fillColor:"#C0D966"},{vn:"oA_n_cB"}],
    ////       ],
    ////     },
    ////   ],
    //// }
    //// renderMathFunc(graph_venn1);
    ////
    function create_venn(self, board, ven, vns){
      if(!ven){return null;}
      var jsxOb = {
        elType: 'venn',
        uSet: {cpoint:[], wscale:1.0, hscale:1.0, width:0, height:0, vertices:[], a:{}, jsxOb:null},
        eSets: [], // {cpoint:[], wscale:1.0, hscale:1.0, majorAxis:0, minorAxis:0, focalLength:0, fociPoints:[], rotation:0, vertices:[], a:{}, jsxOb:null}
        setOps: [],
      };

        var venO = {};
        if (ven instanceof Array){
          venO.U = [[(board.attr.boundingbox[2] + board.attr.boundingbox[0])/2, (board.attr.boundingbox[3] + board.attr.boundingbox[1])/2] ];
          venO.U = [...venO.U, 1.0, 1.0, {withLines:true, fillOpacity:0}]

          venO.sets = deepCopy(ven);
        }
        else if(typeof(ven)=="object" && ven.sets && ven.sets instanceof Array){
          venO.U = [[(board.attr.boundingbox[2] + board.attr.boundingbox[0])/2, (board.attr.boundingbox[3] + board.attr.boundingbox[1])/2] ];
          venO.U = [...venO.U, 1.0, 1.0, {withLines:true, fillOpacity:0}]

          if(ven.U && (ven.U instanceof Array) && ven.U.length >=3) {
            ven.U[1] = ven.U[1]<0 ? -ven.U[1]:ven.U[1];
            ven.U[2] = ven.U[2]<0 ? -ven.U[2]:ven.U[2];
            ven.U[1] = ven.U[1]>1 ? 1:ven.U[1];
            ven.U[2] = ven.U[2]>1 ? 1:ven.U[2];
            var laste = ven.U[ven.U.length -1];
            laste && typeof(laste)=="object" && !(laste instanceof Array) ? (ven.U[ven.U.length -1] = deepCopy({withLines:true, fillOpacity:0},laste)): (ven.U.push({withLines:true, fillOpacity:0}));
            venO.U = deepCopy(ven.U);
            
            jsxOb.uSet.wscale = ven.U[1];
            jsxOb.uSet.hscale = ven.U[2];
          }

          venO.sets = [];
          venO.ops = [];
          var i;
          ven.sets.forEach((ve) => {
            if(ve && (ve instanceof Array) && ve.length >=3) {
              venO.sets.push(deepCopy(ve));
            }
            else if (ve && typeof(ve) == "object" && ve.set) {
              if ((ve.set instanceof Array) && ve.set.length>3) {
                var lasto  = ve.set[ve.set.length-1];
                var last2o = ve.set[ve.set.length-2];

                if (typeof(lasto) == "object") {
                  if (lasto.vn){ if (typeof (last2o) == "object") {ve.set[ve.set.length-2] = deepCopy(last2o, ve.a?ve.a:{});}else{ve.set.push(deepCopy(lasto));ve.set[ve.set.length-2]=ve.a?ve.a:{};}}
                  else {ve.set[ve.set.length-1] = deepCopy(lasto, ve.a?ve.a:{});}
                }
                else {
                  ve.set.push(deepCopy(ve.a?ve.a:{}));
                  if(ve.vn) {ve.set.push({vn:ve.vn});}
                }
              }
              else {
                ve.set.push(deepCopy(ve.a?ve.a:{}));
                if(ve.vn) {ve.set.push({vn:ve.vn});}
              }
              venO.sets.push(deepCopy(ve.set));
            }
          });

          if(ven.ops && (ven.ops instanceof Array)) {
            venO.ops = deepCopy(ven.ops);
          }
        }
        else {return null;}

        //only esets, so uSet uses boundingbox of jsxGraph board.
        jsxOb.uSet.cpoint = deepCopy(venO.U[0]);
        jsxOb.uSet.width = jsxOb.uSet.wscale * Math.abs(board.attr.boundingbox[2] - board.attr.boundingbox[0]);;
        jsxOb.uSet.height = jsxOb.uSet.hscale * Math.abs(board.attr.boundingbox[3] - board.attr.boundingbox[1]);
        jsxOb.uSet.vertices = [
          [jsxOb.uSet.cpoint[0] + jsxOb.uSet.width/2, jsxOb.uSet.cpoint[1] + jsxOb.uSet.height/2], // [1,1],   1st quadrant
          [jsxOb.uSet.cpoint[0] - jsxOb.uSet.width/2, jsxOb.uSet.cpoint[1] + jsxOb.uSet.height/2], // [-1,1],  2nd quadrant
          [jsxOb.uSet.cpoint[0] - jsxOb.uSet.width/2, jsxOb.uSet.cpoint[1] - jsxOb.uSet.height/2], // [-1,-1], 3rd quadrant
          [jsxOb.uSet.cpoint[0] + jsxOb.uSet.width/2, jsxOb.uSet.cpoint[1] - jsxOb.uSet.height/2], // [1,-1],  4th quadrant
        ];

        var laste = venO.U[venO.U.length -1];
        laste && typeof(laste)=="object" && !(laste instanceof Array) ? (jsxOb.uSet.a = deepCopy(laste)): null
        jsxOb.uSet.vn = vns+".u";
        self.addVO({vn:jsxOb.uSet.vn, o:deepCopy(venO.U)});
        
        // eSet
        var iset = 0;
        for (e of venO.sets) {
          if(typeof(e)=="object" && (e instanceof Array) && e.length >= 3){
            var eSet = {vn:vns+".set."+iset, cpoint:[], wscale:1.0, hscale:1.0, majorAxis:0, minorAxis:0, focalLength:0, fociPoints:[], rotation:0, vertices:[], a:{}, jsxOb:null};

            if ((e[0] instanceof Array) && e[0].length >= 2) {
              if (!(typeof(e[0][0]) === 'number') || !(typeof(e[0][1]) === 'number')) {break;}
              e[0] = e[0].slice(0,2);
            }
            else if (typeof(e[0]) == "object" && e[0].elType == "point" ) {
              e[0] = [e[0].X(), e[0].Y()];
            }
            else {break;}

            if (!(typeof(e[1]) === 'number' && e[1]>0) || !(typeof(e[2]) === 'number'  && e[2]>0)) {break;}

            eSet.cpoint = deepCopy(e[0]);
            eSet.cpoint[0] = jsxOb.uSet.cpoint[0] + eSet.cpoint[0] * jsxOb.uSet.wscale;
            eSet.cpoint[1] = jsxOb.uSet.cpoint[1] + eSet.cpoint[1] * jsxOb.uSet.hscale;

            eSet.wscale = e[1]>1 ? 1:e[1]; // its value is percent/ratio of uSet.width, 0 < majorAxis < 1.
            eSet.hscale = e[2]>1 ? 1:e[2]; // its value is percent/ratio of uSet.height, 0 < minorAxis < 1.
            
            eSet.rotation = 0;
            if (e.length >= 3 && typeof(e[3]) === 'number') {
              eSet.rotation = e[3];
            }
            var lasto = e[e.length-1];
            if (lasto && typeof(lasto) == "object" && lasto.vn){check_vn(lasto.vn) ? (eSet.vn = vns+".set."+lasto.vn) :null; lasto = e[e.length-2];}
            lasto && (typeof(lasto) == "object" && !(lasto instanceof Array) && !lasto.vn) ? (eSet.a = deepCopy(lasto)):null;
            if(eSet.a.name){
              eSet.a = deepCopy(eSet.a, {label:{position:"lt"}}); //anchorX:"middle",anchorY:"middle"
            }

            var a,b,c;
            a = jsxOb.uSet.width * eSet.wscale;
            b = jsxOb.uSet.height * eSet.hscale;
            if (a>=b) {
              eSet.majorAxis = a;
              eSet.minorAxis = b;
              c = Math.sqrt(Math.abs(Math.pow(a,2) - Math.pow(b,2)));
              eSet.focalLength = c;

              eSet.fociPoints.push([eSet.cpoint[0] +c/2,  eSet.cpoint[1]]);
              eSet.fociPoints.push([eSet.cpoint[0] -c/2,  eSet.cpoint[1]]);

              eSet.vertices.push([eSet.cpoint[0] + a/2,  eSet.cpoint[1]]);
              eSet.vertices.push([eSet.cpoint[0],  eSet.cpoint[1] + b/2]);
              eSet.vertices.push([eSet.cpoint[0] - a/2,  eSet.cpoint[1]]);
              eSet.vertices.push([eSet.cpoint[0],  eSet.cpoint[1] - b/2]);
            }
            else{
              eSet.majorAxis = b;
              eSet.minorAxis = a;
              a = eSet.majorAxis;
              b = eSet.minorAxis;

              c = Math.sqrt(Math.abs(Math.pow(a,2) - Math.pow(b,2)));
              eSet.focalLength = c;

              eSet.fociPoints.push([eSet.cpoint[0],  eSet.cpoint[1] +c/2]);
              eSet.fociPoints.push([eSet.cpoint[0],  eSet.cpoint[1] -c/2]);

              eSet.vertices.push([eSet.cpoint[0],  eSet.cpoint[1] + a/2]);
              eSet.vertices.push([eSet.cpoint[0] + b/2,  eSet.cpoint[1]]);
              eSet.vertices.push([eSet.cpoint[0],  eSet.cpoint[1] - a/2]);
              eSet.vertices.push([eSet.cpoint[0] - b/2,  eSet.cpoint[1]]);
            }

            if(eSet.rotation!=0){
              for (var i=0; i<eSet.fociPoints.length; i++) {
                eSet.fociPoints[i] = rotate_point(eSet.fociPoints[i], eSet.cpoint, eSet.rotation);                   
              }

              for (var i=0; i<eSet.vertices.length; i++) {
                eSet.vertices[i] = rotate_point(eSet.vertices[i], eSet.cpoint, eSet.rotation);
              }
            }

            jsxOb.eSets.push(eSet);
            self.addVO({vn:eSet.vn, o:deepCopy(e)});
            
          }
          iset++;
        }
        
        // check 
        if(jsxOb.eSets.length < venO.sets.length){
          log.warn("Some thing wrong for venn 'sets'. Valid set length:",jsxOb.eSets.length,", but size of sets:", venO.sets.length);
          return null;
        }

        ////
        if(jsxOb.uSet.a.label && jsxOb.uSet.a.label.offset){jsxOb.uSet.a.label.offset[0] = parseInt(jsxOb.uSet.a.label.offset[0] * self.wscale);jsxOb.uSet.a.label.offset[1] = parseInt(jsxOb.uSet.a.label.offset[1] * self.hscale);}
        jsxOb.uSet.jsxOb = create_polygon(board, [...deepCopy(jsxOb.uSet.vertices), jsxOb.uSet.a]);
        if(jsxOb.uSet.jsxOb) jsxOb.uSet.jsxOb.vennType = "U";
        self.addV({vn:jsxOb.uSet.vn, jsxob:jsxOb.uSet.jsxOb});
        jsxOb.eSets.forEach((e) =>{if(e.a.label && e.a.label.offset){e.a.label.offset[0] = parseInt(e.a.label.offset[0] * self.wscale);e.a.label.offset[1] = parseInt(e.a.label.offset[1] * self.hscale);}  e.jsxOb = create_ellipse(board, [e.fociPoints[0], e.fociPoints[1], e.vertices[0], e.a]); if(e.jsxOb) e.jsxOb.vennType = "Set"; self.addV({vn:e.vn, jsxob:e.jsxOb}); });

        //// set operations
        ////
        // eOps
        var iops = 0;
        for (e of venO.ops) {
          var eOps = {ops:"", vn:vns+".op."+iops, sets:[], a:{}, jsxOb:null};
          if ((e instanceof Array) && e.length >= 2 && typeof(e[0]) == "string") {
            if (["i","intersection"].includes(e[0])) {eOps.ops = 'i';}
            else if (["u","union"].includes(e[0])) {eOps.ops = 'u';}
            else if (["c","complement"].includes(e[0])) {eOps.ops = 'c';}
            else {log.warn("Unknown venn set operation:",e[0]); continue;}
          
            if ((e[1] instanceof Array) && e[1].length >0){
              for (es of e[1]) {
                if(typeof(es)=="function" && es.type == "ref"){eOps.sets.push(es);} //eOps.sets.push(es(vns)
                else {log.warn("The set in venn ops is not a ref function:", es); continue;}
              }
            }
            if(e.length > 2 && typeof(e[2])=="object"){
              // console.log("e[2]:",e[2]);
              if (e[2].vn) {
                check_vn(e[2].vn) ? (eOps.vn = vns+".op."+e[2].vn) : (eOps.vn = vns+".op."+iops);
              }
              else {
                eOps.a = deepCopy(e[2]);
                eOps.vn = vns+".op."+iops;
              }
            }
            if (e.length > 3) {
              if(typeof(e[3])=="object" && e[3].vn && check_vn(e[3].vn)){eOps.vn = vns+".op."+e[3].vn }
              else {eOps.vn = vns+".op."+iops;}
            }
          }

          jsxOb.setOps.push(eOps);
          self.addVO({vn:eOps.vn, o:deepCopy(e)});
          // console.log("addVO, eOps.vn:",eOps.vn);

          iops++;
        }
        
        // check
        if(jsxOb.setOps.length < venO.ops.length){
          log.warn("Some thing wrong for venn 'ops'. Valid venn ops length:",jsxOb.setOps.length,", but size of ops:", venO.ops.length);
          return jsxOb;
        }

        //draw setOps
        jsxOb.setOps.forEach(e => {
          var ii=0; for (es of e.sets) {if(typeof(es)=="function" && es.type == "ref"){e.sets[ii] = es(vns);} ii++;}

          if (['i','u'].includes(e.ops) && e.sets.length >= 2) {
            if (e.ops == 'i') {
              var s0 = null, s0_cu = null;
              for (next of e.sets) {
                if (!next) {log("wrong, skip a null element for set intersection:");}
                if(next.vennType && next.vennType == "U"){continue;}
                if (!s0 && next.vennType != "Cu") {s0 = next; continue;}
                if (!s0_cu && next.vennType == "Cu") {s0_cu = next.vennCuCurves[1]; continue;}

                if (next.vennType != "Cu") {
                  s0 = create_curveintersection(board, [[s0,next] ]);
                } else {
                  s0_cu = create_curveunion(board, [[s0_cu,next.vennCuCurves[1]] ]);
                }
              }
              if(s0 && s0_cu){
                e.jsxOb = create_curvedifference(board, [[s0,s0_cu], e.a]);
              }
              else if(!s0 && s0_cu){
                e.jsxOb = create_curvedifference(board, [[jsxOb.uSet.jsxOb,s0_cu], e.a]);
                e.jsxOb.vennType = "Cu";
                e.jsxOb.vennCuCurves = [jsxOb.uSet.jsxOb,s0_cu];
              }
              else if (s0 && !s0_cu) {
                e.jsxOb = create_curveunion(board, [[s0,s0], e.a]);
              }
              else e.jsxOb = null;
              self.addV({vn:e.vn, jsxob:e.jsxOb});
              // console.log("i e.vn:",e.vn, ", e.jsxOb:", e.jsxOb);
            }
            else if (e.ops == 'u') {
              var s0 = null, s0_cu = null;
              for (next of e.sets) {
                if (!next) {log("wrong, skip a null element for set union:");}
                if(next.vennType && next.vennType == "U"){e.jsxOb = jsxOb.uSet.jsxOb;break;}
                if (!s0 && next.vennType != "Cu") {s0 = next; continue;}
                if (!s0_cu && next.vennType == "Cu") {s0_cu = next.vennCuCurves[1]; continue;}

                if (next.vennType != "Cu") {
                  s0 = create_curveunion(board, [[s0,next] ]);
                } else {
                  s0_cu = create_curveintersection(board, [[s0_cu,next.vennCuCurves[1]] ]);
                }
              }
              // console.log("s0:",s0,", s0_cu:",s0_cu);
              if(e.jsxOb&&e.jsxOb.vennType && e.jsxOb.vennType == "U"){addV({vn:e.vn, jsxob:e.jsxOb});}
              else {
                if(s0 && s0_cu){
                  s0_cu = create_curvedifference(board, [[s0_cu,s0] ]);
                  e.jsxOb = create_curvedifference(board, [[jsxOb.uSet.jsxOb,s0_cu], e.a]);
                  // e.jsxOb = s0_cu;
                  e.jsxOb.vennType = "Cu";
                  e.jsxOb.vennCuCurves = [jsxOb.uSet.jsxOb,s0_cu];
                }
                else if(!s0 && s0_cu){
                  e.jsxOb = create_curvedifference(board, [[jsxOb.uSet.jsxOb,s0_cu], e.a]);
                  e.jsxOb.vennType = "Cu";
                  e.jsxOb.vennCuCurves = [jsxOb.uSet.jsxOb,s0_cu];
                }
                else if (s0 && !s0_cu) {
                  e.jsxOb = create_curveunion(board, [[s0,s0], e.a]);
                }
                else e.jsxOb = null;
                self.addV({vn:e.vn, jsxob:e.jsxOb});
              }
              // console.log("u addV, e.vn:",e.vn,", e.jsxOb:",e.jsxOb);
            }
          }
          else if (['c'].includes(e.ops) && e.sets.length >= 1) {
            var s0 = null, s0_cu = null;
            for (next of e.sets) {
              if (!next) {log("wrong, skip a null element for set complement:");}
              if(next.vennType && next.vennType == "U"){continue;}
              if (!s0 && next.vennType != "Cu") {s0 = next; continue;}
              if (!s0_cu && next.vennType == "Cu") {s0_cu = next.vennCuCurves[1]; continue;}

              if (next.vennType != "Cu") {
                s0 = create_curveunion(board, [[s0,next] ]);
              } else {
                s0_cu = create_curveintersection(board, [[s0_cu,next.vennCuCurves[1]] ]);
              }
            }
            if(s0 && s0_cu){
              e.jsxOb = create_curvedifference(board, [[s0_cu,s0], e.a]);
            }
            else if(!s0 && s0_cu){
              e.jsxOb = create_curveunion(board, [[s0_cu,s0_cu], e.a]);
            }
            else if (s0 && !s0_cu) {
              e.jsxOb = create_curvedifference(board, [[jsxOb.uSet.jsxOb,s0], e.a]);
              e.jsxOb.vennType = "Cu"; e.jsxOb.vennCuCurves=[jsxOb.uSet.jsxOb,s0];
            }
            else e.jsxOb = null;
            self.addV({vn:e.vn, jsxob:e.jsxOb});
            // console.log("c addV, e.vn:",e.vn,", e.jsxOb:",e.jsxOb);
            ////
          }
          else {self.addV({vn:e.vn, jsxob:null});};
        });

        //// draw line of sets again
        jsxOb.eSets.forEach((e) =>{e.jsxOb = create_ellipse(board, [e.fociPoints[0], e.fociPoints[1], e.vertices[0] ]);});
        // log("venn jsxOb:",jsxOb);

      return jsxOb;
    }

    function create_functiongraph(board, f){
      if(!f){return null;}
      var jsxOb = null;
          var attrs = deepCopy(curveStyle);
          // console.log("create_functiongraph, f:",f);
          if (f instanceof Array){
            jsxOb = board.create('functiongraph', [...f], attrs);
          }
          else if(typeof(f) == "object" && f.f){
            attrs = f.a && typeof (f.a) == "object" && f.a.name?deepCopy(attrs, funcStyleWithName, true):attrs;
            attrs = f.a && typeof (f.a) == "object"?deepCopy(attrs, f.a, true):attrs;
            jsxOb = board.create('functiongraph', [...f.f], attrs);
          }
      return jsxOb;
    }

    function create_text(board, t){
      if(!t){return null;}
      var jsxOb = null;
          var fontsize = g_fontSize;
          var attrs = {fontSize: fontsize, useKatex:false};
          if (t instanceof Array){
            if (t.length < 3) {return null;}
            attrs.fontSize = t[3] && typeof(t[3]) == "object" && t[3].fontSize?t[3].fontSize:attrs.fontSize;
            attrs.useKatex = t[3] && typeof(t[3]) == "object" && t[3].useKatex?t[3].useKatex:attrs.useKatex;
            jsxOb = board.create('text',[t[0], t[1], t[2]],  attrs);
          }
          else if(typeof(t) == "object" && t.t){
            if (! t.t instanceof Array || t.t.length < 3) {return null;}
            attrs = t.a && typeof (t.a) == "object"?deepCopy(attrs, t.a, true):attrs;
            jsxOb = board.create('text',[t.t[0], t.t[1], t.t[2]],  attrs);
          }
      return jsxOb;
    }

    ////
    function get_combine_HTML(self){
    //   var id_with_katex_css = "swmath_with_katex_css";
      var ckbox = document.querySelector("#"+g_id_with_katex_css);
      // console.log("ckbox.checked:",ckbox.checked, ", ckbox.value:",ckbox.value, ", ckbox:",ckbox, ", ckbox.value:",ckbox.value);
      
      var s= "";
      if (ckbox.checked) {
        s += "<link rel=\"stylesheet\" href=\"katex.min.css\">\n";
      }
      
      s += "<table><tr>\n";
      var i = 0;
      self.svg_pool.forEach((svg_xml) => {
        s += "\n<td>\n";
        s += svg_xml;
        s += "\n</td>\n";
        i++;
      });
      s += "\n</tr></table>";

      if (!ckbox.checked) {
        var tmpDiv = document.createElement("div");
        tmpDiv.innerHTML = s;
        tmpDiv.querySelectorAll(".katex-html").forEach((el, index) => {
          if(el.getAttribute('aria-hidden')) {el.innerHTML = "";el.outerHTML = "";}
        });
        s = tmpDiv.innerHTML;
      }
      return s;
    }

    function initStyle(){
        pointStyle.label = pointStyle.label?pointStyle.label:{}; pointStyle.label.fontSize = g_fontSize;
        xAxisLabel.label = xAxisLabel.label?xAxisLabel.label:{}; xAxisLabel.label.fontSize = g_fontSize;
        yAxisLabel.label = yAxisLabel.label?yAxisLabel.label:{}; yAxisLabel.label.fontSize = g_fontSize;
        tickPointStyle.x.label = tickPointStyle.x.label?tickPointStyle.x.label:{}; tickPointStyle.x.label.fontSize = g_fontSize;
        tickPointStyle.y.label = tickPointStyle.y.label?tickPointStyle.y.label:{}; tickPointStyle.y.label.fontSize = g_fontSize;
        var styleList = [
            xlabelPosition, ylabelPosition, xAxisLabel, yAxisLabel, ticksWithoutGrid,ticksInvisible,
            pointStyle, lineStyle, lineStyleWithName,
            dashLineStyle, curveStyle, curveStyleWithName, 
            angleStyle,polygonStyle,polygonStyleWithName,angleStyleWithName,arcLastArrowStyle,
            funcStyleWithName,tickPointStyle,tickPointStyle.x,tickPointStyle.y,
            pointLabelPosition,
        ];
        var i=0;
        for (s of styleList) {if(s.fontSize){s.fontSize = g_fontSize;} else if(s.label && s.label.fontSize){s.label.fontSize = g_fontSize;}; i++;}
    }

    function drawBoard(instance, displayDiv, graphList, test_tool_flag=false){
        // put parameter graphList into pool
            instance.graph_opt_pool.push(graphList);

            //// local for this board and render. the variables user defines.
            var V = []; // define a variable name to represent JSX graph instance list.
            var VO = {}; // use a variable name to represent the graph list  that user defines. points, lines, functiongraphs, texts.
            var VO_nl = [];
            instance.g_V.push(V); instance.g_VO.push(VO); instance.g_VO_nl.push(VO_nl);

            // console.log("--------- g_index="+g_index+" ---------");
            // log("--------- g_index="+instance.g_index+" ---------");
            
            instance.g_index++;
            ////////////////

            
            ////////////////
            ////
            var axis = graphList.axis == undefined?true:!!(graphList.axis);
            var boundingbox = [-5, 5, 5, -5]; // default
            if(graphList.boundingbox && graphList.boundingbox instanceof Array && graphList.boundingbox.length == 4){
                boundingbox = graphList.boundingbox;
            }
            var defaultAxes = {x:{ ...xAxisLabel, ticks:ticksInvisible, }, y: { ...yAxisLabel, ticks:ticksInvisible, }};

            var op_Axes = deepCopy(defaultAxes);
            if(graphList.defaultAxes && typeof(graphList.defaultAxes) == "object"){
                if (graphList.defaultAxes.x && typeof(graphList.defaultAxes.x) == "object") {
                    op_Axes.x = deepCopy(op_Axes.x, graphList.defaultAxes.x);
                }
                if (graphList.defaultAxes.y && typeof(graphList.defaultAxes.y) == "object") {
                    op_Axes.y = deepCopy(op_Axes.y, graphList.defaultAxes.y);
                }
            }

            var board = JXG.JSXGraph.initBoard(displayDiv, {
                // boundingbox: [-1.9, 1.9, 1.9, -1.9],
                // boundingbox: [-2, 2, 4, -4],
                boundingbox: boundingbox,
                axis:axis,
                showNavigation:false,
                showCopyright:false,
                // grid:false,
                // defaultAxes: { // make grid invisible by setting {x,y} ticks.majorHeight be same witch the tick number in axis.
                //   // drawZero: true,
                //   x: { ...xAxisLabel, ticks:ticksInvisible, },
                //   y: { ...yAxisLabel, ticks:ticksInvisible, },
                // },
                defaultAxes: op_Axes,
            });

            //// ticks x y
            // var tickPointStyleWithName = {scale: Math.PI, withLabel: true, label:{fontSize:10, useKatex:true}};
            var tickPointStyleWithName = {withLabel: true, label:{fontSize:g_fontSize, useKatex:true}};
            if (axis && graphList.ticks){
                if (graphList.ticks.xPts){
                    var attr = deepCopy(tickPointStyle.x);
                    var pts = graphList.ticks.xPts;
                    var lasti = graphList.ticks.xPts.length-1;
                    lasti = lasti<0?0:lasti;
                    var lastt = graphList.ticks.xPts[lasti]

                    lastt && typeof(lastt) == "object" ? (pts = pts.slice(0,lasti)):null;
                    lastt && lastt.labels && typeof(lastt.labels) == "object" ? (attr=deepCopy(attr,tickPointStyleWithName)):null;
                    lastt && typeof(lastt) == "object" ? (attr=deepCopy(attr,lastt)):null;
                    board.create('ticks', [board.defaultAxes.x, [...pts]], attr);
                }
                if (graphList.ticks.yPts){
                    var attr = deepCopy(tickPointStyle.y);
                    var pts = graphList.ticks.yPts;
                    var lasti = graphList.ticks.yPts.length-1;
                    lasti = lasti<0?0:lasti;
                    var lastt = graphList.ticks.yPts[lasti]

                    lastt && typeof(lastt) == "object" ? (pts = pts.slice(0,lasti)):null;
                    lastt && lastt.labels && typeof(lastt.labels) == "object" ? (attr=deepCopy(attr,tickPointStyleWithName)):null;
                    lastt && typeof(lastt) == "object" ? (attr=deepCopy(attr,lastt)):null;
                    board.create('ticks', [board.defaultAxes.y, [...pts]], attr);
                    // board.create('ticks', [board.defaultAxes.y, [...graphList.ticks.yPts]], tickPointStyle.y);
                }
            }

            //////// handle the variables user defines.
            
            // origin point
            var vopo = {vn:"p.O", o:[0,0,'O',{}]};
            vopo = graphList.drawO?vopo:{vn:"p.0", o:[0,0,'',{}]};
            graphList.drawO && typeof(graphList.drawO) == "object" && graphList.drawO.name && typeof(graphList.drawO.name) == "string"? (vopo.o[2]=graphList.drawO.name):null;
            graphList.drawO && typeof(graphList.drawO) == "object" ? vopo.o[3]=deepCopy(graphList.drawO):null;
            axis?null:(vopo.o=null);
            graphList.drawO?null:(vopo.o=null);
            instance.addVO(vopo);
            V[vopo.vn] = create_point(board, VO[vopo.vn]);

            //// others
            var i =0;
            //normal points
            i=1;graphList.points?graphList.points.forEach(p => {if(!p)return;if(p instanceof Array ){instance.addVO({vn:"p."+i,o:p});i++;}else if(typeof(p) == "object"){if(p.vn&&check_vn(p.vn)){instance.addVO({vn:"p."+p.vn,o:p});i++;}else{instance.addVO({vn:"p."+i,o:p});i++;}}}):null;
            //lines
            i=0;graphList.lines?graphList.lines.forEach(l => {if(!l)return;if(l instanceof Array ){instance.addVO({vn:"l."+i,o:l});i++;}else if(typeof(l) == "object"){if(l.vn&&check_vn(l.vn)){instance.addVO({vn:"l."+l.vn,o:l});i++;}else{instance.addVO({vn:"l."+i,o:l});i++;}}}):null;
            //segments
            i=0;graphList.segments?graphList.segments.forEach(sl => {if(!sl)return;if(sl instanceof Array ){instance.addVO({vn:"sl."+i,o:sl});i++;}else if(typeof(sl) == "object"){if(sl.vn&&check_vn(sl.vn)){instance.addVO({vn:"sl."+sl.vn,o:sl});i++;}else{instance.addVO({vn:"sl."+i,o:sl});i++;}}}):null;
            //angles
            i=0;graphList.angles?graphList.angles.forEach(ag => {if(!ag)return;if(ag instanceof Array ){instance.addVO({vn:"ag."+i,o:ag});i++;}else if(typeof(ag) == "object"){if(ag.vn&&check_vn(ag.vn)){instance.addVO({vn:"ag."+ag.vn,o:ag});i++;}else{instance.addVO({vn:"ag."+i,o:ag});i++;}}}):null;
            //polygons
            i=0;graphList.polygons?graphList.polygons.forEach(pg => {if(!pg)return;if(pg instanceof Array ){instance.addVO({vn:"pg."+i,o:pg});i++;}else if(typeof(pg) == "object"){if(pg.vn&&check_vn(pg.vn)){instance.addVO({vn:"pg."+pg.vn,o:pg});i++;}else{instance.addVO({vn:"pg."+i,o:pg});i++;}}}):null;
            //ellipses
            i=0;graphList.ellipses?graphList.ellipses.forEach(elp => {if(!elp)return;if(elp instanceof Array ){instance.addVO({vn:"elp."+i,o:elp});i++;}else if(typeof(elp) == "object"){if(elp.vn&&check_vn(elp.vn)){instance.addVO({vn:"elp."+elp.vn,o:elp});i++;}else{instance.addVO({vn:"elp."+i,o:elp});i++;}}}):null;
            //venns
            i=0;graphList.venns?graphList.venns.forEach(ven => {if(!ven)return;if(ven instanceof Array ){instance.addVO({vn:"ven."+i,o:ven});i++;}else if(typeof(ven) == "object"){if(ven.vn&&check_vn(ven.vn)){instance.addVO({vn:"ven."+ven.vn,o:ven});i++;}else{instance.addVO({vn:"ven."+i,o:ven});i++;}}}):null;
            //functiongraphs
            i=0;graphList.functiongraphs?graphList.functiongraphs.forEach(f => {if(!f)return;if(f instanceof Array ){instance.addVO({vn:"f."+i,o:f});i++;}else if(typeof(f) == "object"){if(f.vn&&check_vn(f.vn)){instance.addVO({vn:"f."+f.vn,o:f});i++;}else{instance.addVO({vn:"f."+i,o:f});i++;}}}):null;
            
            //title text
            i=0;graphList.title?[graphList.title].forEach(t =>{if(!t)return;if(t instanceof Array ){instance.addVO({vn:"t."+i,o:t});i++;}else if(typeof(t) == "object"){if(t.vn&&check_vn(t.vn)){instance.addVO({vn:"t."+t.vn,o:t});i++;}else{instance.addVO({vn:"t."+i,o:t});i++;}}}):[1].forEach(t =>{instance.addVO({vn:"t.0", o:null});});
            //normal texts
            i=1;graphList.texts?graphList.texts.forEach(t => {if(!t)return;if(t instanceof Array ){instance.addVO({vn:"t."+i,o:t});i++;}else if(typeof(t) == "object"){if(t.vn&&check_vn(t.vn)){instance.addVO({vn:"t."+t.vn,o:t});i++;}else{instance.addVO({vn:"t."+i,o:t});i++;}}}):null;

            // log("graph_opt_pool:",instance.graph_opt_pool);
            //// generate a new array from an array VO_nl and an object VO .
            // log("VO:",Object.values(VO_nl).map((v) => {var a={};a[v]=VO[v];return a;}));

            //// handle variables defined
            if (graphList.define){
                graphList.define.forEach(vns => {
                var vnp = vnTypePair(vns);
                if(!vnp){return;}
                if(!VO[vns]){return;}
                // console.log("vns:",vns,", vnp:",vnp,", VO["+vns+"]:",VO[vns]);

                var jsxOb = null;
                if(vnp.type == 'p'){ // point
                    jsxOb = create_point(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'l'){ // line
                    jsxOb = create_line(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'sl'){ // segment
                    jsxOb = create_segment(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'ag'){ // angle
                    jsxOb = create_angle(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'pg'){ // polygon
                    jsxOb = create_polygon(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'elp'){ // ellipse
                    jsxOb = create_ellipse(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'f'){ // functiongraph
                    jsxOb = create_functiongraph(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 't'){ // text
                    jsxOb = create_text(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                });
            }

            VO_nl.forEach(vns => {
                var vnp = vnTypePair(vns);
                if(!vnp){return;}
                if(!VO[vns]){return;}
                if(V[vns]){return;}
                // console.log("vns:",vns,", vnp:",vnp,", VO["+vns+"]:",VO[vns]);

                var jsxOb = null;
                if(vnp.type == 'p'){ // point
                    jsxOb = create_point(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'l'){ // line
                    jsxOb = create_line(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'sl'){ // segment
                    jsxOb = create_segment(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'ag'){ // angle
                    jsxOb = create_angle(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'pg'){ // polygon
                    jsxOb = create_polygon(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'elp'){ // ellipse
                    jsxOb = create_ellipse(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'ven'){ // venn
                    jsxOb = create_venn(instance, board, VO[vns], vns);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 'f'){ // functiongraph
                    jsxOb = create_functiongraph(board, VO[vns]);
                    V[vns] = jsxOb;
                }
                if(vnp.type == 't'){ // text
                    if (vns == "t.0"){ // t.0: title text. i.e. title: {content:"A", fontSize:15}
                    if(!VO[vns]){return;}
                    var txtPos = [
                            displayDiv.clientWidth>40?20/displayDiv.clientWidth:0,
                            board.attr.boundingbox[3]*(1- (displayDiv.clientHeight>40?30/displayDiv.clientHeight:0)),
                    ];
                    var tcontent = typeof(VO[vns]) == "string"?VO[vns]:(typeof(VO[vns]) == "object" && typeof(VO[vns].content) == "string"?VO[vns].content:'');
                    var attr = typeof(VO[vns]) == "object" && VO[vns].fontSize?{fontSize:VO[vns].fontSize}:{fontSize:g_fontSize+6};
                    attr = typeof(VO[vns]) == "object"?[1].forEach(ii => {for (key in VO[vns]){if(key=="content" || key=="fontSize"){return;} attr[key]=VO[vns][key];}}):attr;
                    VO[vns] = tcontent?{t:[...txtPos, tcontent],a:{...attr}}:null;
                    }

                    jsxOb = create_text(board, VO[vns]);
                    V[vns] = jsxOb;
                }
            });

            // board.renderer.dumpToCanvas('canvas_jsximage',400,400).then(function() { console.log('done for jsximage:'); });

            if(test_tool_flag) instance.board_pool.push(board);
            // log("V:",Object.values(VO_nl).map((v) => {var a={};a[v]=V[v];return a;}));

            var base64_txt_dump = board.renderer.dumpToDataURI(false);
            var ar = base64_txt_dump.split(',');

            //// need to delete <span class="katex-html" aria-hidden="true">,
            //// otherwise, svg will show the original text beside katex string.
            //// Alternatively it requires katex.min.css in html.
            var tmpDiv = document.createElement("div");
            tmpDiv.innerHTML = decodeURIComponent(escape(atob(ar[1])));

            return tmpDiv.innerHTML;
            ////
            // board.renderer.dumpToCanvas('canvas_jsximage',400,400);
    }


    //////////////////
    ////////////////////////////////////////////////
    //////////////////
    // constructor SWMathGraph
    var SWMathGraph = function (options) {
        var instance = this;
        this.instance_id = generateID(); addInstancePool({id:instance.instance_id, instance:instance});
        this.g_index = 0;
        this.jxgbox_pool = [];
        this.output_pool = [];
        this.svg_pool = [];
        this.board_pool = [];
        this.image_pool = [];
        this.graph_opt_pool = [];
        this.options = {
            with_katex_css: false,
            textFontSize: 10,
            panelClassName: "jxgbox",
        };
        this.defaultWidth = "200px";
        this.defaultHeight = "200px";
        this.panelWidth = this.defaultWidth;
        this.panelHeight = this.defaultHeight;
        this.wscale = 1.0;
        this.hscale = 1.0;

        ////
        options?(this.options = deepCopy(this.options, options)):null;
        if (typeof(this.options.textFontSize) == "string") this.options.textFontSize = Number(this.options.textFontSize);
        g_fontSize = this.options.textFontSize;
        initStyle();

        //// the variables user defines.
        this.g_V = [];      // V = []; // define a variable name to represent JSX graph instance list.
        this.g_VO = [];     // VO = {}; // use a variable name to represent the graph list  that user defines. points, lines, functiongraphs, texts.
        this.g_VO_nl = [];  // VO_nl = [];
        this.addVO = function (vo){var i = instance.g_index-1; i = i<0?0:i; if(vo&&typeof(vo)=="object"&&vo.vn&&!instance.g_VO_nl[i].includes(vo.vn)){instance.g_VO[i][vo.vn]=vo.o;instance.g_VO_nl[i].push(vo.vn);}}
        this.addV = function (v){var i = instance.g_index-1; i = i<0?0:i; if(v&&typeof(v)=="object"&&v.vn){instance.g_V[i][v.vn]=v.jsxob;}}

        this.getGraphOp = function (){var i = instance.g_index-1; i = i<0?0:i; if(instance.graph_opt_pool.length > i){return deepCopy(instance.graph_opt_pool[i]);}else{return {};}}

        ////
        this.renderMathFunc = function (graphList){
            if(graphList.debug){f_debug = graphList.debug;}else{f_debug = false;}
            this.checkAndSetPanelSize(graphList);

            ////////////////
            var id_jxgboxDiv,id_outputDiv,id_td_jxgbox,id_td_output;
            if (instance.g_index>0) {
                id_jxgboxDiv = g_id_jxgboxDiv+""+instance.g_index;
                id_outputDiv = g_id_outputDiv+""+instance.g_index;
                id_td_jxgbox = g_id_td_jxgbox+""+instance.g_index;
                id_td_output = g_id_td_output+""+instance.g_index;
            }
            else {
                instance.jxgbox_pool = [];
                instance.output_pool = [];
                instance.svg_pool = [];
                instance.board_pool = [];
                instance.image_pool = [];
                instance.graph_opt_pool = [];

                id_jxgboxDiv = g_id_jxgboxDiv;
                id_outputDiv = g_id_outputDiv;
                id_td_jxgbox = g_id_td_jxgbox;
                id_td_output = g_id_td_output;

                instance.g_V = []; instance.g_VO = []; instance.g_VO_nl = [];
            }
            //// create jxgbox div and output textarea
            checkAndCreateJxgboxParentTd(instance,id_td_jxgbox);
            checkAndCreateOutputParentTd(instance,id_td_output);

            checkAndCreateJxgbox(instance,id_jxgboxDiv, id_td_jxgbox);
            checkAndCreateOutput(instance,id_outputDiv, id_td_output);

            //// draw math graph
            var jxgboxDiv = document.querySelector('#'+id_jxgboxDiv);
            var outputDiv = document.querySelector('#'+id_outputDiv);

            var svgxml = drawBoard(instance, jxgboxDiv, graphList, test_tool_flag=true);
            instance.svg_pool.push(svgxml);
            
            var tmpDiv = document.createElement("div");
            tmpDiv.innerHTML = svgxml;
            // var id_with_katex_css = "with_katex_css";
            var ckbox = document.querySelector("#"+g_id_with_katex_css);
            if (!ckbox.checked) {
                tmpDiv.querySelectorAll(".katex-html").forEach((el, index) => {
                if(el.getAttribute('aria-hidden')) {el.innerHTML = "";el.outerHTML = "";}
                });
            }
            outputDiv.value = tmpDiv.innerHTML;
            return tmpDiv.innerHTML;
        };

        this.toJsonObj = function(graph_obj_text) {
            graph_obj_text = graph_obj_text.replace(/\/\*.*\*\//gs,'').trim()
            var lines = graph_obj_text.split(/(\r?\n)/);
            graph_obj_text = "";
            var i=0;
            for (line of lines) {
                line = line.replace(/\/\/.*$/,'').trim();
                if(!line || line=="") continue;
                graph_obj_text += (i>0?"\n":"") + line;
                i++;
            }
            if (graph_obj_text[0] != '{' || graph_obj_text[graph_obj_text.length-1] != '}'){
                console.error("Math graph text is invalid.");
                return null;  
            }
            setCurrentInstance(this);
            var graphList = eval('('+graph_obj_text+')');
            return graphList;
        }

        this.checkAndSetPanelSize = function(graphList) {
            if (!graphList) return;
            if (typeof(graphList) == "string") {graphList = this.toJsonObj(graphList);}
            if (!graphList) return;

            this.panelWidth = this.defaultWidth; this.panelHeight = this.defaultHeight; this.wscale = 1.0; this.hscale = 1.0; 
            if(graphList.zoom && typeof(graphList.zoom)=="object"){if(graphList.zoom.wscale && parseFloat(graphList.zoom.wscale)>100.0){this.wscale = 100.0;}else if(graphList.zoom.wscale && parseFloat(graphList.zoom.wscale)>=0.01){this.wscale = parseFloat(graphList.zoom.wscale);}     if(graphList.zoom.hscale && parseFloat(graphList.zoom.hscale)>100.0){this.hscale = 100.0;}else if(graphList.zoom.hscale && parseFloat(graphList.zoom.hscale)>=0.01){this.hscale = parseFloat(graphList.zoom.hscale);}}
            if(graphList.panelSize && typeof(graphList.panelSize)=="object"){if(graphList.panelSize.w && parseInt(graphList.panelSize.w)>10000){this.panelWidth = parseInt(10000*this.wscale) + "px";}else if(graphList.panelSize.w && parseInt(graphList.panelSize.w)>=100){this.panelWidth = parseInt(parseInt(graphList.panelSize.w)*this.wscale) + "px";}  if(graphList.panelSize.h && parseInt(graphList.panelSize.h)>10000){this.panelHeight = parseInt(10000*this.hscale) + "px";}else if(graphList.panelSize.h && parseInt(graphList.panelSize.h)>=100){this.panelHeight = parseInt(parseInt(graphList.panelSize.h)*this.hscale) + "px";}}
            // console.log("checkAndSetPanelSize(): this.panelWidth:",this.panelWidth, ", graphList.panelSize:",graphList.panelSize, ", graphList.zoom:",graphList.zoom);
        }

        ////
        this.renderGraph = function (oneDiv, graphList){
            if(graphList.debug){f_debug = graphList.debug;}else{f_debug = false;}
            this.checkAndSetPanelSize(graphList);

            //// draw math graph
            var displayDiv, hiddenDiv;
            if(oneDiv && typeof(oneDiv) == "string") { // div ID
                displayDiv = document.getElementById(oneDiv);
            }
            else if(oneDiv && typeof(oneDiv) == "object" && oneDiv.nodeType == 1) { // HTMLElement
                displayDiv = oneDiv;
            }
            if(!displayDiv) {
                displayDiv = document.createElement('div');
                displayDiv.style.width = instance.panelWidth; //"200px";
                displayDiv.style.height = instance.panelHeight; //"200px";
                displayDiv.style.display = "none";
                document.body.appendChild(displayDiv);
                hiddenDiv = displayDiv;
            }
            // displayDiv.className = 'jxgbox';

            var svgxml = drawBoard(instance, displayDiv, graphList);

            if(hiddenDiv) document.body.removeChild(hiddenDiv);
            return svgxml;
        };

        this.on_convert_to_image_display = function (){
            if (instance.board_pool.length == 0) {return;}
            
            var id_imageCanvas = g_id_imageCanvas;
            var id_td_jsximage = g_id_td_jsximage;
            var i = 0;
            instance.board_pool.forEach((b) => {
                if (i>0) {
                    id_imageCanvas = g_id_imageCanvas+""+i;
                    id_td_jsximage = g_id_td_jsximage+""+i;
                }
                else {
                    id_imageCanvas = g_id_imageCanvas;
                    id_td_jsximage = g_id_td_jsximage;
                }

                checkAndCreateJsximageParentTd(instance, id_td_jsximage);
                checkAndCreateJsximageCanvas(instance, id_imageCanvas, id_td_jsximage);

                //// convert svg into image and draw svg image in canvas
                var data = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(document.querySelector("#"+instance.output_pool[i]).value);
                var image = new Image();
                image.crossOrigin = "anonymous";
                image.src = data;

                var width = parseInt(instance.panelWidth), height = parseInt(instance.panelHeight);
                var canvas = document.querySelector("#"+id_imageCanvas);
                // the larger the value, the higher the pixel density
                var ratio = window.devicePixelRatio || 1;
                canvas.width = width * ratio;
                canvas.height = height * ratio;
                var ctx = canvas.getContext("2d");
                ctx.scale(ratio, ratio);
                // console.log("ratio:",ratio,", canvas.width:", canvas.width,", canvas.height:", canvas.height)

                setTimeout(()=>{
                    ctx.drawImage(image, 0, 0);
                }, 500);
                ////
                
                //// bug for the katex string display
                // b.renderer.dumpToCanvas(id_imageCanvas, 200,200).then(function() { console.log('done for jsximage:',id_imageCanvas); });
                // b.renderer.dumpToCanvas(id_imageCanvas, 200,200);
                // b.renderer.screenshot(b, id_imageCanvas);
                
                i++;
            });

            // var jsximage_table = document.querySelector('#table_jsximage');
        }

        this.on_combine_display = function (){
            if (instance.output_pool.length == 0){
                return;
            }

            var s = get_combine_HTML(instance);
            var iframe_srcdoc = "";
            iframe_srcdoc += "<div id=\"swmath_graph_combine\">\n"+s+"\n</div>\n";
            iframe_srcdoc += "<textarea id=\"swmath_output_combine\" style=\"overflow-y: auto;width:800px; height:400px;\">"+s+"</textarea>";

            // var id_combine_iframe = "combine_iframe";
            var cife = document.querySelector("#"+g_id_combine_iframe);
            cife.srcdoc = iframe_srcdoc;
        }

        this.on_combine_copy_HTML = function (){
            var s = get_combine_HTML(instance);
            navigator.clipboard.writeText(s);
        }
    };

    // public APIs
    SWMathGraph.prototype = {
        renderTest: function (oneDiv, graph_obj_text, options) {
            setCurrentInstance(this);
            var graphList = this.toJsonObj(graph_obj_text);
            if(!graphList){console.error("Math graph text is invalid JSON."); return null;}
    
            this.checkAndSetPanelSize(graphList);
            checkAndCreatePanels(this, oneDiv);
            return this.renderMathFunc(graphList);
        },

        render: function (oneDiv, graph_obj_text, options) {
            setCurrentInstance(this);
            var graphList = this.toJsonObj(graph_obj_text);
            if(!graphList){console.error("Math graph text is invalid JSON."); return null;}
            return this.renderGraph(oneDiv, graphList);
        },

        filterSvgXMLWithoutKatex: function(svgxml){
            var tmpDiv = document.createElement("div");
            tmpDiv.innerHTML = svgxml;

            tmpDiv.querySelectorAll(".katex-html").forEach((el, index) => {
                if(el.getAttribute('aria-hidden')) {el.innerHTML = "";el.outerHTML = "";}
            });
            return tmpDiv.innerHTML;
        },

        drawSvgOnCanvas: function(oneCanvas, svgxml, width=parseInt(this.panelWidth), height=parseInt(this.panelHeight)) {
            var canvas;
            if(oneCanvas && typeof(oneCanvas) == "string") { // div ID
                canvas = document.getElementById(oneCanvas);
            }
            else if(oneCanvas && typeof(oneCanvas) == "object" && oneCanvas.nodeType == 1) { // HTMLElement
                canvas = oneCanvas;
            }
            if(!canvas) {
                log_error("canvas no found:",canvas);
                return;
            }
            //// convert svg into image and draw svg image in canvas
            var data = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgxml);
            var image = new Image();
            image.crossOrigin = "anonymous";
            image.src = data;

            // var width = 200, height = 200;
            // var canvas = document.querySelector("#"+id_imageCanvas);
            // the larger the value, the higher the pixel density
            var ratio = window.devicePixelRatio || 1;
            // ratio = 1;
            canvas.width = width * ratio;
            canvas.height = height * ratio;
            // console.log("ratio:",ratio,",canvas.width:",canvas.width,",canvas.height:",canvas.height);
            var ctx = canvas.getContext("2d");
            ctx.scale(ratio, ratio);
            // ctx.scale(1, 1);

            setTimeout(()=>{
                ctx.drawImage(image, 0, 0);
            }, 500);
        },

        setPanelSize: function(graphList) {
            // console.log("setPanelSize call this.checkAndSetPanelSize(graphList), graphList:",graphList);
            this.checkAndSetPanelSize(graphList);
        },

        convert_to_image_display: function() {
            this.on_convert_to_image_display();
        },

        combine_display: function (){
            this.on_combine_display();
        },

        combine_copy_HTML: function (){
            this.on_combine_copy_HTML();
        },

        test: function (string) {
            string = string || '';
            return regex.test(string);
        },
        // toString: function (format) {
        //     format = format || this.opts.format;
        //     return "";
        // },
    };

    return SWMathGraph;

}));
