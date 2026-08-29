////////Error for front-matter.js: javascript: require is not defined
//////// self define front-matter
//////// definition of  front-matter, refer to https://cdn.jsdelivr.net/npm/front-matter@2/

(function (root, factory) {
    root.FrontMatter = factory();
}(this, function (jsyaml) {

    var optionalByteOrderMark = '\\ufeff?';
    var platform = typeof process !== 'undefined' ? process.platform : '';
    var pattern = '^(' +
        optionalByteOrderMark +
        '(= yaml =|---)' +
        '$([\\s\\S]*?)' +
        '^(?:\\2|\\.\\.\\.)\\s*' +
        '$' +
        (platform === 'win32' ? '\\r?' : '') +
        '(?:\\n)?)';
    
    var regex = new RegExp(pattern, 'm');

    function computeLocation (match, body) {
        var line = 1;
        var pos = body.indexOf('\n');
        var offset = match.index + match[0].length;

        while (pos !== -1) {
            if (pos >= offset) {
            return line;
            }
            line++;
            pos = body.indexOf('\n', pos + 1);
        }

        return line;
    }

    //////////////////
    // constructor FrontMatter
    var FrontMatter = function (jsyaml) {
        var self = this;
        this.jsyaml = jsyaml;

        this.parse = function(string, allowUnsafe) {
            var match = regex.exec(string);
            if (!match) {
                return {
                attributes: {},
                body: string,
                bodyBegin: 1
                };
            }

            // var loader = allowUnsafe ? parser.load : parser.safeLoad;
            var yaml = match[match.length - 1].replace(/^\s+|\s+$/g, '');
            var attributes = this.jsyaml.load(yaml) || {};
            var body = string.replace(match[0], '');
            var line = computeLocation(match, string);

            return {
                attributes: attributes,
                body: body,
                bodyBegin: line,
                frontmatter: yaml
            };
        }
    };

    // public APIs
    FrontMatter.prototype = {
        extractor: function (string, options) {
            string = string || '';
            var defaultOptions = { allowUnsafe: false };
            options = options instanceof Object ? { ...defaultOptions, ...options } : defaultOptions;
            options.allowUnsafe = Boolean(options.allowUnsafe);
            var lines = string.split(/(\r?\n)/);
            if (lines[0] && /= yaml =|---/.test(lines[0])) {
                return this.parse(string, options.allowUnsafe);
            } else {
                return {
                attributes: {},
                body: string,
                bodyBegin: 1
                };
            }
        },
        test: function (string) {
            string = string || '';
            return regex.test(string);
        }
    };

    return FrontMatter;

}));

//////// Markdown tool
//////// definition of  SWMDtool

(function (root, factory) {
    root.SWMDtool = factory();
}(this, function (md_options) {

    var marked = null;
    var katex = null;
    var jsyaml = null;
    var hljs = null;
    var mermaid = null;
    var swmathgraph = null;
    var fm = null;
    var mdfile_name = "";
    var page = {};
    var default_page_opt = {};

    var __mdtool_id = 1;
    const idGenerator = {
        next: () => __mdtool_id++,
    };
    
    //////// markedjs + katex
    const [blockType, onlineType] = ['block', 'online'];
    const khandleRender = function(ktex_str, ktex_type) {
        try {
            var display_mode = ktex_type == 'block'?true:false;
            return katex.renderToString(ktex_str, {
                throwOnError: true,
                displayMode: display_mode,
                output: 'html'
            });
        } catch (error) {
            // console.error(error);
            return `<div class='bl-preview-analysis-fail-${ktex_type}'>
                <div class="fail-title">Katex syntax parsing failed!</div><br/>
                ${error}<br/><br/>
                You can try visiting the <a href='https://katex.org' target='_blank'>Katex official site</a> to validate your formula, 
                or check the <a href='https://katex.org/#demo' target='_blank'>related documentation</a>
                </div>`;
        }
    }

    const swmathGraphHandleRender = function(graph_text, render_type) {
        try {
            if (render_type && render_type == "svg") {
                var svgxml = swmathgraph.render('',graph_text);
                return svgxml;
            }
            else if(render_type && ['png','jsxgraph'].includes(render_type)) {
                return `<div class="swmathgraph" render-type="${render_type}">${graph_text}</div>`;
            }
            else {
                return `<pre><code class="swmathgraph" render-type="${render_type}">${graph_text}</code></pre>`;
            }
        } catch (error) {
            return `<div class='bl-preview-analysis-fail-${render_type}'>
                <div class="fail-title">swmath graph syntax parsing failed!</div><br/>
                ${error}<br>
                <br>
                <br>
                Please check graph text :<br>
                <textarea>${graph_text}</textarea>
                </div>`;
        }
    }

    const onelineRule = /^(\${1,2}|\\\[|\\\()([^$\n]+?)(\${1,2}|\\\]|\\\))/;
    const blockRule = /^(\${2}|\\\[)((?![`~$])[\s\S]+?)(\${2}|\\\])/;
    const blockRule1 = /^(\${2}|\\\[)([^$]+?)(\${2}|\\\])/;

    const inlineRule = /^(\${1,2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1(?=[\s?!\.,:？！。，：]|$)/;
    const inlineRuleNonStandard = /^(\${1,2}|\\\(|\\\[)(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))(\${1,2}|\\\)|\\\])/;
    const inlineBlockRuleNonStandard = /^(\${2})(?!\$)((?:\\.|[^\\\n])*?(?:\\.|[^\\\n\$]))\1/;
    const possibleBlockRule = /(\${2})((?![`~])[\s\S]+?)\1/;
    const pageVarRuleReg = /^(\{{2}) ?(page\.[a-zA-Z0-9'"_\[\].]+?) ?(\}{2})/;
    const emStrongRule = /^([*]{2})(?<![`*$])(.*)+?\1/;
    var emStrongRuleReg = /(<(?![`*<>$])(.*))(\*{2})((?![`*<>$]).*)(\*{2})(.*(?<![`*<>$])>)/;
    var htmlTagReg = /<([a-zA-Z]+)(?:\s|>)/;

    const katexOptions = { nonStandard: true, throwOnError: false, output: 'html' };
    const pageOptions = {};
    function createRenderer() {
        return (token) => token.text;
    }
    function inlinePageVar(pageOptions, renderer) {
        const ruleReg = pageVarRuleReg;
        return {
            name: "inlinePageVar",
            level: "inline",
            start(src) {
                let index, lsep_index;
                let indexSrc = src;
                if (indexSrc) {
                    index = indexSrc.indexOf("{{");
                    lsep_index = indexSrc.indexOf("\n");
                    if (index === -1 || lsep_index > 0 && index > lsep_index || index>1 && indexSrc.charAt(index - 1) == '\\') {
                        return;
                    }
                    const possibleKatex = indexSrc.substring(index);
                    if (possibleKatex.match(ruleReg)) {
                        return index;
                    }
                }
            },
            tokenizer(src, tokens) {
                const match = src.match(ruleReg);
                if (match) {
                    return {
                        type: "codespan",
                        lang: 'pagevar',
                        raw: match[0],
                        text: match[0],
                    };
                }
            },
            renderer
        };
    }

    function inlineKatex(options, renderer) {
        const nonStandard = options && options.nonStandard;
        const ruleReg = nonStandard ? inlineRuleNonStandard : inlineRule;
        return {
            name: "inlineKatex",
            level: "inline",
            start(src) {
                let index, lsep_index;
                let indexSrc = src;
                if (indexSrc) {
                    index = indexSrc.indexOf("$");
                    lsep_index = indexSrc.indexOf("\n");
                    if (index === -1 || lsep_index > 0 && index > lsep_index || index>1 && indexSrc.charAt(index - 1) == '\\') {
                        return;
                    }
                    const f = nonStandard ? index > -1 : index === 0 || indexSrc.charAt(index - 1) === " ";
                    if (f) {
                        const possibleKatex = indexSrc.substring(index);
                        if (possibleKatex.match(ruleReg)) {
                            return index;
                        }
                    }
                }
            },
            tokenizer(src, tokens) {
                const match = src.match(ruleReg);
                if (match) {
                    return {
                        type: "codespan",
                        lang: 'katex',
                        raw: match[0],
                        text: match[0],
                        displayMode: match[1].length === 2 && match[1].indexOf("\\(") != 0
                    };
                }
            },
            renderer
        };
    }

    ///////
    //// For block katex match, use the following format 
    //// which there should be a blank line or a paragraph seperator (like ```,~~~, <, etc)
    ////  before the first $$.
    //// For example :
    ////
    //// $$
    //// ...
    //// $$
    //////////
    function blockKatex(options, renderer) {
        // const nonStandard = options && options.nonStandard;
        return {
            name: "blockKatex",
            level: "block",
            tokenizer(src, tokens) {
                var match;
                match = src.match(blockRule);
                if (match) {
                    return {
                    type: "code",
                    lang: 'katex',
                    raw: match[0],
                    text: match[0],
                    displayMode: match[1].length === 2
                    };
                }
            },
            renderer
        };
    }

    var _tag = "span|address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
    var html_tagnames = _tag.split('|');
    var other = {
        escapeTest: /[&<>"']/,
        escapeReplace: /[&<>"']/g,
        escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
        escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
    };
    var escapeReplacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };
    var getEscapeReplacement = (ch) => escapeReplacements[ch];
    function escape2(html2, encode) {
        if (encode) {
            if (other.escapeTest.test(html2)) {
            return html2.replace(other.escapeReplace, getEscapeReplacement);
            }
        } else {
            if (other.escapeTestNoEncode.test(html2)) {
            return html2.replace(other.escapeReplaceNoEncode, getEscapeReplacement);
            }
        }
        return html2;
    }
    function renderTokens(tokens, encode) {
        var html2 = "";
        tokens.forEach(function(t){
            if (t.type === "text") {html2 += escape2(t.text, encode);}
            else if (t.type === "escape") {html2 += t.text;}
            else if (t.type === "strong") {html2 += "<strong>"+escape2(t.text, encode)+"</strong>";}
            else {html2 += escape2(t.text, encode);}
        });
        return html2;
    }

    const renderer = {
        codespan(src) {
            if (src.lang === 'katex') {
                let arr = src.text.match(blockRule);
                if (arr != null && arr.length > 0) {
                    return khandleRender(arr[2], blockType);
                }
                else{
                    arr = src.text.match(onelineRule);
                    if (arr != null && arr.length > 0) {
                        return khandleRender(arr[2], onlineType);
                    }
                }
            }
            else if (src.lang === 'pagevar') {
                // swmdtool supports the customized variable in markdown file.
                // {{page.food}} will be translate into food's value according to its definition in page head.
                // ---
                // title: t1.md
                // food: Pizza
                // output:
                // word_document:
                //     path: C:\Users\xxx\Downloads\export_t1_md.docx
                // ---
                let arr = src.text.match(pageVarRuleReg);
                if (arr != null && arr.length > 0) {
                    value = eval(arr[2]);
                    if (typeof(value)!='string' && typeof(value)=='object'){
                        value = JSON.stringify(value); //JSON.stringify(value, null, 2)
                    }
                    else if(value == undefined){
                        value = src.text;
                    }
                    return `${value}`;
                }
            }
            return false;
        },
        code(code, language, _isEscaped) {
            if (code.lang === 'katex') {
                let arr = code.text.match(blockRule);
                if (arr != null && arr.length > 0) {
                    return khandleRender(arr[2], blockType);
                }
            }
            else if (code.lang === 'mermaid') {
                // modify tag name from <code> => <div>
                // fix class diagram bug for <<interface>> of class
                code.text = code.text.replace(/</g,'&lt;').replace(/>/g,'&gt;');
                return `<div class="mermaid">${code.text}</div>`;
            }
            else if (code.lang === 'swmathgraph') {
                if(code.render_type && code.render_type == "svg"){
                    return swmathGraphHandleRender(code.text, code.render_type);
                }
                else if(code.render_type && ['png','jsxgraph'].includes(code.render_type)) {
                    return `<div class="swmathgraph" render-type="${code.render_type}">${code.text}</div>`;
                }
                else if(code.render_type) {
                    return `<pre><code class="swmathgraph" render-type="${code.render_type}">${code.text}</code></pre>`;
                }
                else{
                    return `<pre><code class="swmathgraph">${code.text}</code></pre>`;
                }
            }
            return false;
        },
        text(token){
            // fix bug, parse emStrong str: **B.**
            if (token.tokens) {return false;}

            var ruleReg = emStrongRuleReg;
            var match1 = null;
            var match = token.text.match(ruleReg);
            if (match) {
                var ntoken1 = {
                    type: "text",
                    raw: token.text.substring(0,match.index) + match[1] ,
                    text: token.text.substring(0,match.index) + match[1] ,
                }
                var ntext = ntoken1.text;
                match1 = ntext.match(htmlTagReg);
                while (match1) {
                    if (html_tagnames.includes(match1[1])){
                        ntoken1.type = "escape";
                        break;
                    };
                    ntext = ntext.substring(match1[0].length);
                    match1 = ntext.match(htmlTagReg);
                }
                var ntoken2 = {
                    type: "strong",
                    raw: `${match[3]}${match[4]}${match[5]}`,
                    text: match[4],
                }
                var htext = ntoken1.raw + ntoken2.raw;
                var ntoken3 = {
                    type: "text",
                    raw: token.text.substring(htext.length),
                    text: token.text.substring(htext.length),
                }

                ntext = ntoken3.text;
                match1 = ntext.match(htmlTagReg);
                while (match1) {
                    if (html_tagnames.includes(match1[1])){
                        ntoken3.type = "escape";
                        break;
                    };
                    ntext = ntext.substring(match1[0].length);
                    match1 = ntext.match(htmlTagReg);
                }
                token.tokens = [ntoken1, ntoken2, ntoken3];
                token.text = renderTokens(token.tokens);
                return token.text;
            }
            else if ((match = token.text.match(/^\s?(\*{2})((?![`*<>$]).*)(\*{2})\s?$/))) {
                var ntoken2 = {
                    type: "strong",
                    raw: `${match[1]}${match[2]}${match[3]}`,
                    text: match[2],
                }
                token.tokens = [ ntoken2 ];
                return renderTokens(token.tokens);
            }
            return false;
        },
    }
    const katexTestRuleRegex = new RegExp(/[^\\](\${1,2}|\\\[|\\\()([^`~$\n]+?[^\\])(\${1,2}|\\\]|\\\))/);
    const katexTestRule = /(\${1,2}|\\\[|\\\()([^`~$\n]+?[^\\])(\${1,2}|\\\]|\\\))/;
    const codeTestRule = /`+/;
    const katexRule1 = /^`katex\s(\$+[^`$\n]+?\$+)`/;
    const katexRule2 = /^(\${1,2}|\\\[|\\\()([^`~$\n]+?[^\\])(\${1,2}|\\\]|\\\))/;
    var inlineCodeRule = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
    

    // refer to // src/Tokenizer.ts in https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.umd.js
    // Override function
    function indentCodeCompensation(raw, text, rules) {
        // console.log("indentCodeCompensation rules:",rules);
        const matchIndentToCode = raw.match(rules.other.indentCodeCompensation);
        if (matchIndentToCode === null) {
            return text;
        }
        const indentToCode = matchIndentToCode[1];
        return text.split("\n").map((node) => {
            const matchIndentInNode = node.match(rules.other.beginningSpace);
            if (matchIndentInNode === null) {
            return node;
            }
            const [indentInNode] = matchIndentInNode;
            if (indentInNode.length >= indentToCode.length) {
            return node.slice(indentToCode.length);
            }
            return node;
        }).join("\n");
    }
    const tokenizer = {
        codespan(src) {
            var match = src.match(katexRule1);
            if (match) {
                return {
                    type: 'codespan',
                    raw: match[0],
                    lang: 'katex',
                    text: match[1]
                };
            }

            // return false to use original codespan tokenizer
            return false;
        },
        blockquote(src) {
            var match = src.match(blockRule);
            if (match) {
                return {
                    type: 'code',
                    raw: match[0],
                    lang: 'katex',
                    text: match[0]
                };
            }

            // return false to use original codespan tokenizer
            return false;
        },
        fences(src) {
            const cap = this.rules.block.fences.exec(src);
            if (cap) {
                const raw = cap[0];
                const text = indentCodeCompensation(raw, cap[3] || "", this.rules);
                var lang_str = cap[2] ? cap[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : cap[2];
                var lang_items = lang_str.split('-');
                var lang = lang_items && lang_items instanceof Array && lang_items.length > 0? lang_items[0]:lang_str;
                if(lang == "swmathgraph"){
                    // render_type: ''|svg|png|jsxgraph|text
                    var render_type = lang_items && lang_items instanceof Array && lang_items.length > 1? lang_items[1].toLowerCase():'';
                    if(!render_type || !(['svg','png','jsxgraph'].includes(render_type))) {lang = "javascript";render_type = "text"};
                    return {
                        type: "code",
                        raw,
                        lang: lang,
                        render_type:render_type,
                        text
                    };
                }
            }
            return false;
        },
    };

    function addStyle(outputDiv, tocDiv, fileDiv) {
        // add style for outputDiv and tocDiv
        var styleE = null

        if(outputDiv){
            styleE = outputDiv.querySelector("style");
            if (!styleE) {
                styleE = document.createElement("style");
                outputDiv.appendChild(styleE);
            }
            var ori = styleE.innerHTML;
            var s = `
                @font-face { 
                    font-family: 'source-code-pro'; 
                    src: url('/css/fonts/SourceCodePro-Regular.ttf.woff') format('woff');
                    /* font-weight: 600; */
                    font-style: normal;
                }
                @font-face { 
                    font-family: 'KaTeX-Main'; 
                    src: url('/css/fonts/KaTeX_Main-Regular.woff') format('woff'),
                         url('/css/fonts/KaTeX_Main-Italic.woff') format('woff'),
                         url('/css/fonts/KaTeX_Main-Bold.woff') format('woff'),;
                    /* font-weight: 600; */
                    font-style: normal;
                }
                @font-face { 
                    font-family: 'KaTeX-SansSerif'; 
                    src: url('/css/fonts/KaTeX_SansSerif-Regular.woff') format('woff'),
                         url('/css/fonts/KaTeX_SansSerif-Italic.woff') format('woff'),
                         url('/css/fonts/KaTeX_SansSerif-Bold.woff') format('woff'),;
                    /* font-weight: 600; */
                    font-style: normal;
                }
                .page article {
                    padding: 10px;
                }
                .page article title {
                    font-size: 30px;
                    display: block;
                    text-align: center;
                }
                .page article author {
                    font-size: 11px;
                    display: block;
                    text-align: center;
                }
                .page article date {
                    font-size: 11px;
                    display: block;
                    text-align: center;
                }
                .page article tags {
                    font-size: 11px;
                    display: block;
                    text-align: center;
                }
                .page article tags::before {
                    font-size: 11px;
                    content: "tags: ";
                }

                .page code {
                    font-family: source-code-pro, consolas, monospace, -apple-system, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo;
                    background: #f5f5f5;
                    /*padding: 2px 6px;*/
                    border-radius: 4px;
                    color: #e96900;
                    font-size: 0.9em;
                }
                .page pre {
                    position: relative;
                    background: #F5F5F5; /*#F6F8FA;*/
                    color: #000;
                    padding: 5px;
                    border-radius: 6px;
                    overflow-x: auto;
                    margin: 1em 0;
                    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
                    font-size: 14px;
                    /*box-shadow: 0 1px 3px rgba(0,0,0,0.1);*/
                    border: solid 1px #CCCCCC;
                }
                .page pre code {
                    background: none;
                    padding: 0;
                    color: inherit;
                }

                .page .code-context-menu {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    padding: 4px 8px;
                    border: none;
                    display: none;
                }
                .page .copy-btn, .page .line-number-btn {
                    background: #B2B4B6;
                    color: #fff;
                    border: none;
                    margin: 5px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background 0.2s;
                }
                .page .copy-btn:hover, .page .line-number-btn:hover {
                    background: #D2D4D6;
                }

                .page pre code table {  width: 100%;  border-collapse: collapse !important;  table-layout: auto;  }
                .page tbody tr:hover {  background-color: #e8f4fd;  }
                .page .code-actions {
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    display: flex;
                    gap: 6px;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                    z-index: 10;
                }
                .page pre:hover .code-actions {
                    opacity: 1;
                }
                .page .code-action-btn {
                    width: 28px;
                    height: 28px;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #6a737d;
                    background-color: transparent;
                    border: 1px solid #e1e4e8;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .page .code-action-btn:hover {
                    background-color: #f1f3f5;
                    color: #24292e;
                    border-color: #586069;
                }
                .page .code-action-btn svg {
                    width: 14px;
                    height: 14px;
                }
                .page .code-action-btn.copied,
                .page .code-action-btn.active {
                    color: #31a476;
                    border-color: #31a476;
                }
                /* line number display styles */
                /*.page pre.show-line-numbers code {
                    counter-reset: line-number;
                }
                .page pre.show-line-numbers code .line {
                    counter-increment: line-number;
                    position: relative;
                    padding-left: 10px;
                }
                .page pre.show-line-numbers code .line::before {
                    content: counter(line-number);
                    position: absolute;
                    left: -30px;
                    width: 24px;
                    text-align: right;
                    color: #6a737d;
                    font-size: 12px;
                    user-select: none;
                }*/
                .page .katex {
                    font-family: 'KaTeX-Main', 'KaTeX-SansSerif';
                    font-size: 1.0em;
                    text-indent: 0;
                    text-rendering: auto;
                }
                .page table.altrowstable {
                    /* font-family: verdana,arial,sans-serif; */
                    /* font-size:11px; */
                    color:#000;
                    border-width: 1px;
                    border-color: #fff;
                    border-collapse: collapse;
                }
                .page table.altrowstable th, .page table.altrowstable td {
                    border-width: 1px;
                    padding: 8px;
                    border-style: solid;
                    border-color: #ddd;
                }
                .page table.altrowstable th {    border-bottom-width: 2px; }
                .page .oddrowcolor{
                    background-color:#fff;
                }
                .page .evenrowcolor{
                    background-color:#F6F8FA;
                }
                .page .theadrowcolor{
                    background-color:#F6F8FA;
                }
                .page a { color: #2c82ff; text-decoration: underline; }
                .page a:hover { text-decoration: none; color: white; }
                .page blockquote {
                    margin: 1em 0;
                    padding: 1px 15px;
                    background: #f9f9f9;
                    border-left: 4px solid #2c82ff;
                    color: #555;
                    border-radius: 4px;
                    word-break: break-all;
                    overflow-wrap: break-word;
                    /*max-width: auto;*/
                }
                .page #context-menu{
                    display: none;
                    position: fixed;
                    background-color: #fff;
                    color: #0F0308;
                    font-size: 13px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
                    z-index: 1000;
                    border-radius:5px;
                }
                .page #context-menu ul {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                .page #context-menu ul li {
                    padding: 3px 22px;
                    cursor: pointer;
                    width: 250px;
                }
                .page #context-menu ul li:hover {
                    background-color: #f1f1f1;
                }
                .page #context-menu .shortcut {
                    /* align-self: right; */
                    position:relative;
                    float:right;
                }

                .page .hljs-ln-numbers {
                    text-align: right;
                    color: #ccc;
                    border-right: 1px solid #CCC;
                    vertical-align: top;
                    padding-right: 5px !important;
                    white-space: nowrap;
                    min-width: 40px;
                    width: 0;
                }
                .page .hljs-ln-code {
                    padding-left: 5px !important;
                    width: 100%;
                    text-align: left !important;
                    align-items: left !important;
                    word-wrap: break-word;
                }
                .page .hljs-ln {
                    border-collapse:collapse;
                    font-size: inherit;
                    font-family: inherit;
                    white-space: pre;
                }
                .page .hljs-ln td {
                    padding:0;
                }
                .page .hljs-ln-n:before {
                    content:attr(data-line-number);
                }

                .page .hljs-cmd-prompt {
                    color: #888;
                }
                .page .hljs-cmd-name {
                    color: #DA2792; /*#0b11d3ff;*/
                }
                .page .hljs-cmd-params {
                    color: #222;
                }
                .page .hljs-cmd-variable {
                    color: #130a94a2;
                }
                .page ul li{
                    list-style: disc;  margin-left: 20px; padding-left: 5px;
                }
                .page ul li ul li {
                    list-style: circle;  margin-left: 20px; padding-left: 5px;
                }
                .page ol li{
                    list-style: decimal;  margin-left: 20px; padding-left: 5px;
                }
                .page ol li ol li{
                    list-style: lower-roman;  margin-left: 20px; padding-left: 5px;
                }
            `;

            var page;
            if (outputDiv.id){ page = "#" + outputDiv.id; }
            if ((!page || page.length <=1) && outputDiv.className){ var clist = outputDiv.className.split(" ");  if (typeof(clist) == "string"){clist = [clist];}
                page = "." + clist[0];
            }
            if (page && page.length >1) { s = s.replace(/\.page /gs, page+" "); }
            styleE.innerHTML = ori + "\n" + s;
        }
        

        if(tocDiv){
            styleE = tocDiv.querySelector("style");
            if (!styleE) {
                styleE = document.createElement("style");
                tocDiv.appendChild(styleE);
            }
            var ori = styleE.innerHTML;
            var s = `
                .toc {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                .toc li {
                    margin: 10px 0;
                    display: flex;
                    align-items: center;
                }
                .toc .level-tag {
                    display: inline-block;
                    width: 28px;
                    text-align: center;
                    font-size: 12px;
                    color: #888;
                    margin-right: 8px;
                }
                .toc a {
                    text-decoration: none;
                    color: #555;
                    font-size: 14px;
                    transition: color 0.2s;
                    cursor: pointer;
                }
                .toc a:hover {
                    color: #2c82ff;
                }
                .toc .level-2 { margin-left: 16px; }
                .toc .level-3 { margin-left: 32px; }
                .toc .level-4 { margin-left: 48px; }
                .toc .level-5 { margin-left: 64px; }
                .toc .level-6 { margin-left: 80px; }
                .toc .toggle-btn {
                    cursor: pointer;
                    user-select: none;
                    display: inline-block;
                    width: 20px;
                }
            `;
            styleE.innerHTML = ori + "\n" + s;
        }
        if(fileDiv){
            styleE = fileDiv.querySelector("style");
            if (!styleE) {
                styleE = document.createElement("style");
                fileDiv.appendChild(styleE);
            }
            var ori = styleE.innerHTML;
            var s = `
                .fm {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                .fm li {
                    margin: 10px 0;
                    display: flex;
                    align-items: center;
                    /* width: 28px; */
                    text-align: center;
                    font-size: 12px;
                    color: #888;
                    margin-right: 8px;
                }
                .fm .toggle-btn-open {
                    cursor: pointer;
                    user-select: none;
                    display: inline-block;
                    font-size: 9px;
                    text-align: center;
                    width: 15px;
                    margin-right: 6px;
                }
                .fm .toggle-btn-close {
                    cursor: pointer;
                    user-select: none;
                    display: inline-block;
                    font-size: 8px;
                    text-align: center;
                    width: 15px;
                    margin-right: 6px;
                }
            `;
            styleE.innerHTML = ori + "\n" + s;
        }
    }

    function escape_html_for_JSON(key, val) {
        if (typeof(val)!="string") return val;
        return val      
            .replace(/[>]/g, '&gt;')
            .replace(/[<]/g, '&lt;')
            .replace(/\&nbsp;/g, "&amp;nbsp;"); 
    }

    function copyToClipboard(textToCopy, fElem) {
        // navigator clipboard
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(textToCopy);
        } else {
            let textArea = document.createElement("textarea");
            textArea.value = textToCopy;
            textArea.style.position = "absolute";
            textArea.style.opacity = 0;
            textArea.style.readOnly = true;
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            if (fElem) {
                fElem.appendChild(textArea);
                textArea.style.left = fElem.offsetLeft + "px";
                textArea.style.top = fElem.offsetTop + "px";
            }
            else {
                document.body.appendChild(textArea);
            }
            textArea.focus();
            textArea.select();
            return new Promise((res, rej) => {
                document.execCommand('copy') ? res() : rej();
                textArea.remove();
                resolve();
            });
        }
    }
    
    function addCodeActionButtons(output) {
        const codeBlocks = output.querySelectorAll('pre');
        
        codeBlocks.forEach(pre => {
            // check whether the button container already exists
            if (pre.querySelector('.code-actions')) return;
            
            // create the button container
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'code-actions';
            
            // create the copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'code-action-btn codecp-action-btn';
            copyBtn.title = 'Copy';
            copyBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            `;
            
            // copy button click handler
            copyBtn.addEventListener('click', async function(e) {
                e.stopPropagation();
                const code = pre.querySelector('code');
                if (!code) return;
                
                const textToCopy = code.textContent;
                
                try {
                    // navigator clipboard
                    if (!(navigator.clipboard && window.isSecureContext)) {
                        console.log("navigator.clipboard not supported");
                        let textArea = document.createElement("textarea");
                        textArea.value = textToCopy;
                        textArea.style.position = "absolute";
                        textArea.style.opacity = 0;
                        textArea.style.readOnly = true;
                        if (copyBtn) {
                            copyBtn.appendChild(textArea);
                            textArea.style.left = copyBtn.offsetLeft + "px";
                            textArea.style.top = copyBtn.offsetTop + "px";
                        }
                        else {
                            textArea.style.left = "-999999px";
                            textArea.style.top = "-999999px";
                            document.body.appendChild(textArea);
                        }
                        textArea.focus();
                        textArea.select();
                        return new Promise((res, rej) => {
                            document.execCommand('copy') ? res() : rej();
                            textArea.remove();
                            copyBtn.classList.add('copied');
                            copyBtn.title = 'Copied';
                            setTimeout(() => {
                                copyBtn.classList.remove('copied');
                                copyBtn.title = 'Copy';
                            }, 5000);
                            
                            resolve();
                        });
                    }
                    await navigator.clipboard.writeText(textToCopy);
                    copyBtn.classList.add('copied');
                    copyBtn.title = 'Copied';
                    
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.title = 'Copy';
                    }, 5000);
                } catch (err) {
                    console.error('Copy failed:', err);
                }
            });
            
            // create the line-number button
            const lineNumBtn = document.createElement('button');
            lineNumBtn.className = 'code-action-btn codeln-action-btn';
            lineNumBtn.title = 'Line Numbers';
            lineNumBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <!-- 4 small dots on the left (spacing 6, from y=1 to y=19) -->
                    <circle cx="2.5" cy="1" r="1.5"></circle>
                    <circle cx="2.5" cy="7" r="1.5"></circle>
                    <circle cx="2.5" cy="13" r="1.5"></circle>
                    <circle cx="2.5" cy="19" r="1.5"></circle>
                    <!-- middle vertical line (from y=-1 to y=21, aligned with the dots) -->
                    <line x1="8" y1="-1" x2="8" y2="21" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"></line>
                    <!-- 4 short lines on the right (aligned with the left dots) -->
                    <line x1="12.5" y1="1" x2="21" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
                    <line x1="12.5" y1="7" x2="21" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
                    <line x1="12.5" y1="13" x2="21" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
                    <line x1="12.5" y1="19" x2="21" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
                </svg>
            `;
            
            // line-number button click handler
            lineNumBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                pre.classList.toggle('show-line-numbers');
                lineNumBtn.classList.toggle('active');
                
                if(lineNumBtn.classList.contains('active')) {
                    pre.querySelectorAll(".hljs-ln-numbers").forEach((lne) => {lne.style.display = "block"; });
                }
                else {
                    pre.querySelectorAll(".hljs-ln-numbers").forEach((lne) => {lne.style.display = "none"; });
                }
            });
            
            // add the buttons to the container
            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(lineNumBtn);
            pre.appendChild(actionsDiv);
        });
    }

    function generateTOC(output, toc, fn_ul) {
        if(!output ){return;}

        //generate heading ID
        const headings = output.querySelectorAll('h1, h2, h3, h4, h5, h6');
        var heading_id_list = [];
        headings.forEach((heading, index) => {
            if (heading.textContent.match(/^[a-zA-Z0-9 _\-.@]+$/g)) {
                var istr = heading.textContent.trim().replace(/ /g, "-").replace(/[^a-zA-Z0-9_\-]/g, "");
                if(istr){
                    var nistr = istr.toLowerCase();
                    var ii = 1;
                    while (heading_id_list.includes(nistr) ) {nistr = istr+"-"+ii; ii++;}
                    if (!nistr.match(/^[-]*$/g)){
                        heading.id = nistr;
                    }
                }
            }
            heading.id = heading.id?heading.id:`heading-${index}`;
            heading_id_list.push(heading.id);
        });

        if(toc && headings.length === 0){
            toc.innerHTML = '<li>No headings found</li>';
            if (!output.disabledAddStyle) {addStyle(output, toc, fn_ul);}
            console.warn('No headings found in the content');
        }
        else if(toc){
            var lastLi = null;
            toc.innerHTML = '';
            headings.forEach((heading, index) => {
                const level = parseInt(heading.tagName.charAt(1));
                const id = heading.id;
                const titleText = heading.textContent.trim() || heading.innerText.trim();
                if (!titleText) {
                    console.warn(`Heading ${id} has no content, skipped`);
                    return;
                }

                const li = document.createElement('li');
                li.className = `level-${level}`;
                li.style.whiteSpace = "nowrap";

                // toggleTag, support Collapse / Expand
                li.toggleStat = {
                    level: level,
                    hasSubTitle: false,
                    collapsed: false,
                };
                if (lastLi && lastLi.toggleStat.level < level) {
                    lastLi.toggleStat.hasSubTitle = true;
                }
                lastLi = li;

                const toggleTag = document.createElement('span');
                toggleTag.className = 'toggle-btn';
                toggleTag.textContent = ' ';

                const levelTag = document.createElement('span');
                levelTag.className = 'level-tag';
                levelTag.textContent = `H${level}`;
                const a = document.createElement('a');
                a.href = `#${id}`;
                a.textContent = titleText;
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    const target = output.querySelector(`#${id}`);
                    
                    if (target) {
                        var offsetTop = target.offsetTop - 20;
                        if (output.offsetForScroll) {offsetTop = target.offsetTop - output.offsetForScroll;} //output DIV obj customized attr: offsetForScroll
                        offsetTop = Math.max(offsetTop, 0);
                        output.scrollTo({
                            top: offsetTop,
                            behavior: 'smooth'
                        });
                    } else {
                        console.error(`Cannot find target heading: #${id}`);
                    }
                });
                li.appendChild(toggleTag);
                li.appendChild(levelTag);
                li.appendChild(a);
                toc.appendChild(li);
            });
            console.log(`Rendered ${headings.length} headings in total`);

            if(fn_ul) {
                fn_ul.innerHTML = "";
                var liE = document.createElement("li");
                if(fn_ul && page && Object.keys(page).length > Object.keys(default_page_opt).length) {
                    liE.innerHTML = "<span id='fm-toggle-btn' class='toggle-btn-close'>▷</span><span>"+mdfile_name + "</span>";
                    fn_ul.appendChild(liE);

                    var fm_liE = document.createElement("li");
                    fm_liE.innerHTML = "<p>Front-matter properties</p><pre><code class='json'>"+JSON.stringify(page, escape_html_for_JSON, 2)+"</code></pre>";
                    fm_liE.style.display = "none";
                    fm_liE.style.textAlign = "left";
                    fn_ul.appendChild(fm_liE);
                    if(hljs) {
                        fm_liE.querySelectorAll('pre code').forEach((el) => {
                            hljs.highlightElement(el);
                        });
                    }

                    const tbtn = document.getElementById('fm-toggle-btn');
                    if (tbtn) {
                        tbtn.addEventListener('click', () => {
                            if(tbtn.textContent == "▷") {
                                tbtn.textContent = "▽";
                                tbtn.className = 'toggle-btn-open';
                                fm_liE.style.display = "block";
                            }
                            else {
                                tbtn.textContent = "▷";
                                tbtn.className = 'toggle-btn-close';
                                fm_liE.style.display = "none";
                            }
                        });
                    }
                }
                else {
                    liE.innerHTML = "<span>"+mdfile_name + "</span>";
                    fn_ul.appendChild(liE);
                }
            }

            //// toggleTag: toc list supports Collapse / Expand
            // at the beginning, all toc elements is open or expanded.
            toc.querySelectorAll('li').forEach(li => {
                li.toggleStat.collapsed = false;
                li.style.display = "block";

                const tbtn = li.querySelector('.toggle-btn');
                if (tbtn) {
                    if (li.toggleStat.hasSubTitle) {
                        tbtn.textContent = "-";
                    }
                    else {
                        tbtn.textContent = " ";
                    }

                    tbtn.addEventListener('click', () => {
                        if(li.toggleStat.hasSubTitle){
                            li.toggleStat.collapsed = !li.toggleStat.collapsed;
                        }

                        var last_state = {level: 0, collapsed: false};
                        var skip = false;
                        toc.querySelectorAll('li').forEach(li1 => {
                            if (!skip) {
                                const tbtn1 = li1.querySelector('.toggle-btn');
                                if(last_state.level<1 && tbtn1 && (tbtn1.textContent == "+" && !li1.toggleStat.collapsed || 
                                            tbtn1.textContent == "-" && li1.toggleStat.collapsed)
                                ){
                                    last_state.level = li1.toggleStat.level;
                                    last_state.collapsed = li1.toggleStat.collapsed;
                                    tbtn1.textContent = li1.toggleStat.collapsed? "+" : "-";
                                }
                                else if(last_state.level > 0) {
                                    if(li1.toggleStat.level > last_state.level) {
                                        // subtitle
                                        if(last_state.collapsed) {
                                            li1.toggleStat.collapsed = true;
                                            li1.style.display = "none";
                                            if (li1.toggleStat.hasSubTitle && tbtn1) {tbtn1.textContent = "+";}
                                        }
                                        else {
                                            li1.toggleStat.collapsed = false;
                                            li1.style.display = "block";
                                            if (li1.toggleStat.hasSubTitle && tbtn1) {tbtn1.textContent = "-";}
                                        }
                                    }
                                    else {
                                        skip = true;
                                    }
                                }
                            }
                        });
                    });
                }
            });
        };
        
        if (!output.disabledAddStyle) {addStyle(output, toc, fn_ul);}
        addCodeActionButtons(output);

        // table style class
        const tableBlocks = output.querySelectorAll('table');
        tableBlocks.forEach((ta, ind) => {
            ta.className = "altrowstable";
            var rows = ta.getElementsByTagName("tr");
            for(var i = 0; i < rows.length; i++){          
                if(i % 2 == 0){
                    rows[i].className = "evenrowcolor";
                }else{
                    rows[i].className = "oddrowcolor";
                }
            }
            var hrow = ta.querySelector("thead tr");
            if(hrow) {hrow.className = "theadrowcolor";}
        });

        //// handle the link <a>
        var prestr = `${document.location.href}`;
        if(prestr.indexOf('#') >= 0){
            prestr = prestr.substring(0,prestr.indexOf('#'));
        }
        const aBlocks = output.querySelectorAll('a');
        aBlocks.forEach((a, index) => {
            if(!a.href) {return; }
            var ocmatch;
            if((ocmatch = a.href.match(/^onclick:(.*)$/))){
                a.href = "javascript:void(0);";
                a.onclick = ocmatch[1]+";";
            }
            else if((ocmatch = a.href.match(/^javascript:(.*)$/))){
            } 

            if(prestr && a.href.indexOf(prestr) == 0){return;}
            if(!ocmatch) a.target = "_blank";
        });
    };

    //////////////////
    // constructor SWMDtool
    var SWMDtool = function (options) {
        var self = this;
        self.options = {
            marked: options.marked?options.marked:null,
            katex: options.katex?options.katex:null,
            jsyaml: options.jsyaml?options.jsyaml:null,
            hljs: options.hljs?options.hljs:null,
            mermaid: options.mermaid?options.mermaid:null,
            swmathgraph: options.swmathgraph?options.swmathgraph:null,
            // output: options.output?options.output:null,
            // toc: options.toc?options.toc:null,
            mdfile_name: options.mdfile_name?options.mdfile_name:null,
            pageOptions: options.pageOptions?options.pageOptions:{},
        };
        self.defaultPageOptions = {
            s1: "&nbsp;",
            s2: "&nbsp;&nbsp;",
            s4: "&nbsp;&nbsp;&nbsp;&nbsp;",
            s8: "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;",
            s16: "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;",
            pageSep: "<DIV STYLE='page-break-before:always'></DIV>",
        };
        self.page = page;

        marked = self.options.marked;
        katex = self.options.katex;
        jsyaml = self.options.jsyaml;
        hljs = self.options.hljs;
        mermaid = self.options.mermaid;
        swmathgraph = self.options.swmathgraph;
        fm = new FrontMatter(jsyaml);

        if (marked){
            marked.use({
                pedantic: false,
                gfm: true,
                table: true,
                breaks: true,
            });
            marked.use({ hooks: { preprocess } });
            marked.use({
                extensions: [
                    inlinePageVar(pageOptions, createRenderer()),
                    inlineKatex(katexOptions, createRenderer()),
                    blockKatex(katexOptions, createRenderer()),
                ],
            });
            marked.use({ tokenizer });
            marked.use({ renderer: renderer });
        }
        if (mermaid){
            mermaid.initialize({ 
                startOnLoad: false,
                theme: 'default',//default, forest, dark or neutral
                flowchart: { useMaxWidth: false }
            });
        }
        if (hljs){
            hljs.registerLanguage('latex', latex);
            hljs.registerLanguage('cmdlines', cmdlines);
            hljs.registerLanguage('http', http);
            hljs.configure({
                languages: ['html','javascript','latex', ],
            });
        }

        // markedjs Override function
        // front-matter, get the attributes in head.
        function preprocess(markdown) {
            const { attributes, body } = fm.extractor(markdown);
            if (attributes && Object.keys(attributes).length > 0){
                page = {...page, ...attributes};
                self.page = page;
            }

            const regex = /((?<=|\r?\n)> \$\$)([\s\S]*?)(\$\$)/g;
            var processedBodyText = body.replace (regex, (match, start, content, end) => {
                const processedContent = content.replace (/\r?\n(?!>)/g, '\n> ');
                return `${start}${processedContent}${end}`;
            });
            return processedBodyText;
        }
    };

    // public APIs
    SWMDtool.prototype = {
        gentoc: function (output, toc) {
            generateTOC(output, toc);
        },
        parse: function (content, output, toc, fn_ul) {
            return this.options.marked.parse(content);
        },
        render: function (content, output, toc, fn_ul) {
            this.page = {};
            var sss = this.options.marked.parse(content);
            var tmps = "";
            if (this.page.tagName){tmps += "<"+this.page.tagName+">"}
            if (this.page.title){tmps += "<title>"+this.page.title+"</title>"}
            if (this.page.author || this.page.date || this.page.tags) {tmps += "<articlehead>";}
            if (this.page.author){tmps += "<author>"+this.page.author+"</author>"}
            if (this.page.date){tmps += "<date>"+(typeof(this.page.date) == "string" ? this.page.date:this.page.date.toLocaleDateString())+"</date>"}
            if (this.page.tags){tmps += "<tags>"+this.page.tags+"</tags>"}
            if (this.page.author || this.page.date || this.page.tags) {tmps += "</articlehead>";}
            if(tmps && this.page.tagName) {sss = tmps + "<br>" + sss;if (this.page.tagName){sss += "</"+this.page.tagName+">"}}

            const html = '<div class="page">' + sss + '</div>';
            if(output ){
                output.innerHTML = html;
                output.querySelectorAll('div').forEach((el) => {
                    if(el && el.className == "swmathgraph") {
                        var graph_list, render_type;
                        graph_list = el.innerHTML;
                        render_type = el.getAttribute('render-type');

                        if (!graph_list || !(['png','jsxgraph'].includes(render_type)) ) {return;}
                        if (render_type == "png") {
                            var svg_xml = swmathgraph.render('', graph_list);
                            svg_xml = swmathgraph.filterSvgXMLWithoutKatex(svg_xml);
                            el.innerHTML = "";
                            var canvas = document.createElement("canvas");

                            canvas.style.width = swmathgraph.panelWidth; // "200px";
                            canvas.style.height = swmathgraph.panelHeight; // "200px";
                            el.appendChild(canvas);
                            swmathgraph.drawSvgOnCanvas(canvas, svg_xml);
                            
                            el.removeAttribute('render-type');
                        }
                        else if (render_type == "jsxgraph"){
                            swmathgraph.setPanelSize(graph_list);
                            el.style.width = swmathgraph.panelWidth; //"200px";
                            el.style.height = swmathgraph.panelHeight; //"200px";
                            el.className = swmathgraph.options.panelClassName; //"jxgbox";
                            swmathgraph.render(el, graph_list);
                            el.removeAttribute('render-type');
                        }
                    }
                });
                if(mermaid) mermaid.run(); // default div/pre className:mermaid
                if(!output.disabledGenToc) generateTOC(output, toc, fn_ul);
                if (this.page.title && this.page.tagName) { var hobj = output.querySelector('h1, h2, h3, h4, h5, h6'); if (hobj && hobj.innerHTML == this.page.title) {hobj.style.display = "none";}}
                if(hljs) {
                  output.querySelectorAll('pre code').forEach((el) => {
                    if (el.getAttribute('data-highlighted') == "yes") {return;}
                    hljs.highlightElement(el);

                    if(hljs_ln && typeof(hljs_ln) == "function") {
                        hljs_ln().addlineNumbersBlock(el);
                        el.querySelectorAll('.hljs-ln-numbers').forEach((lne) => {lne.style.display = 'none'; });
                    }
                });}
            }
        },
        setOptions: function (options) {
            this.options = {...this.options, ...options};
            default_page_opt = {...this.defaultPageOptions};
            mdfile_name = options.mdfile_name?options.mdfile_name:mdfile_name;
            if (mdfile_name) {default_page_opt = {...default_page_opt, mdfilepath: mdfile_name};}
            if (options.pageOptions) {default_page_opt = {...default_page_opt, ...options.pageOptions};}
            page = {...page, ...default_page_opt};
            this.page = page;
        },
        resetOptions: function () {
            page = {};
            this.page = page;
            default_page_opt = {...this.defaultPageOptions};
            mdfile_name = "";
        },
        getPage: function () {return page;},
        test: function (string) {
            string = string || '';
            return regex.test(string);
        }
    };
    return SWMDtool;
}));
