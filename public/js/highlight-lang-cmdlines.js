/*
Language: Batch file (DOS)
Author: Alexander Makarov <sam@rmcreative.ru>
Contributors: Anton Kochkov <anton.kochkov@gmail.com>
Website: https://en.wikipedia.org/wiki/Batch_file
Category: scripting
*/

/** extended by SW in 2025 */
/** @type LanguageFn */
function cmdlines(hljs) {
  return {
    name: 'CMD Shell',
    aliases: ['cmd', 'command', 'dos', 'shell'],
    case_insensitive: true,
    keywords: {
      // 常见的Windows CMD命令
      $pattern: /(?<![.])[a-zA-Z0-9\-_]+(?=[ |\n])/,
      keyword: [
        'dir', 'cd', 'md', 'rd', 'copy', 'xcopy', 'del', 'erase', 'move', 'ren', 'rename',
        'type', 'echo', 'set', 'setx', 'path', 'title', 'cls', 'exit', 'taskkill', 'tasklist',
        'ipconfig', 'ping', 'tracert', 'netstat', 'net', 'arp', 'diskpart', 'format', 'chkdsk',
        'reg', 'powercfg', 'shutdown', 'systeminfo', 'wmic', 'bitsadmin', 'certutil', 'find',
        'findstr', 'goto', 'call', 'start', 'cmd', 'powershell', 'python', 'node',
        'npm', 'yarn', 'bun', 'git', 'docker', 'kubectl',
        // 'for', 'if', 
        'uname', 'cat', 'uptime', 'hostnamectl', 'whoami', 'id', 'top', 'htop', 'vmstat', 'free',
        'ls', 'du', 'df', 'mount', 'find', 'stat', 'file', 'tree', 'touch', 'mkdir', 'cp', 'mv',
        'rm', 'cat', 'less', 'head', 'tail', 'wc', 'sort', 'ping', 'curl', 'ip', 'ss', 'dig', 'traceroute',
        'wget', 'scp', 'ssh', 'netstat', 'chmod', 'chown', 'adduser', 'passwd', 'usermod', 'groups',
        'su', 'who', 'last', 'sudo', 'apt', 'dpkg', 'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'xz', '7z',
        'grep', 'awk', 'sed', 'cut', 'tr', 'diff', 'paste', 'split', 'nl', 'crontab', 'systemctl',
        'journalctl', 'timedatectl', 'date', 'history', 'alias', 'source', 'time', 'watch', 'pwd',
      ]
    },
    begin: /^[A-Za-z]:\\[^>]+>|^[^@]+@[^:]+:[^$]+[$#]/,
    end: /\n|$/,
    // excludeBegin: false,
    contains: [
      // 1. 命令提示符 - Windows风格
      {
        className: 'cmd-prompt',
        begin: /^[A-Za-z]:\\[^>]+>/,
        relevance: 10
      },
      // 2. 命令提示符 - Unix/Linux风格
      {
        className: 'cmd-prompt',
        begin: /^[^@]+@[^:]+:[^$]+[$#]/,
        relevance: 10
      },
      // 命令
      {
        className: 'cmd-name',
        // className: 'keyword',
        begin: /(?<=[>]\s*)[\w-]+/,
        relevance: 0
      },
      // 3. 命令参数和选项
      {
        className: 'cmd-params',
        begin: /\s-[\w-]+|\/[A-Za-z]/,
        relevance: 5
      },
      // 4. 文件路径和URL
      {
        className: 'string',
        begin: /[A-Za-z]:\\[^ \t\n]+|[\\/][^ \t\n]+/,
        relevance: 1  //3
      },
      // 5. 环境变量 %VAR% 或 $VAR
      {
        className: 'cmd-variable',
        begin: /%[^%]+%|\$[A-Za-z_][A-Za-z0-9_]*/,
        relevance: 1  //5
      },
      // 6. 注释
      {
        className: 'comment',
        begin: /rem\s/,
        end: /$/,
        relevance: 2
      },
      {
        className: 'comment',
        begin: /#/,
        end: /$/,
        relevance: 2
      }
    ],
    // // 处理命令和参数的匹配
    // keywords: function(identifier) {
    //   // 检查是否是关键字命令
    //   if (this.keywords.keyword.includes(identifier.toLowerCase())) {
    //     return 'built_in'; // 命令使用built_in类
    //     // return 'keyword';
    //   }
    //   return false;
    // },
    // 处理其他文本作为普通参数
    defaultMode: {
      className: 'params'
    }
  };
}

// function cmdlines(hljs) {
//   // const COMMENT = hljs.COMMENT(
//   //   /^\s*@?rem\b/, /$/,
//   //   { relevance: 10 }
//   // );
  
//   const COMMENT = hljs.COMMENT(
//     /^[C-Z]:[a-zA-Z_ ~.\-\\]*/, />/, // /^[C-Z]:\\[a-zA-Z \-~_.]*/, />/,
//     { relevance: 1 }
//   );
//   const LABEL = {
//     className: 'symbol',
//     begin: '^\\s*[A-Za-z._?][A-Za-z0-9_$#@~.?]*(:|\\s+label)',
//     relevance: 0
//   };
//   const KEYWORDS = [
//     "if",
//     "else",
//     "goto",
//     "for",
//     "in",
//     "do",
//     "call",
//     "exit",
//     "not",
//     "exist",
//     "errorlevel",
//     "defined",
//     "equ",
//     "neq",
//     "lss",
//     "leq",
//     "gtr",
//     "geq",
//     "bun"
//   ];
//   const BUILT_INS = [
//     "prn",
//     "nul",
//     "lpt3",
//     "lpt2",
//     "lpt1",
//     "con",
//     "com4",
//     "com3",
//     "com2",
//     "com1",
//     "aux",
//     "shift",
//     "cd",
//     "dir",
//     "echo",
//     "setlocal",
//     "endlocal",
//     "set",
//     "pause",
//     "copy",
//     "append",
//     "assoc",
//     "at",
//     "attrib",
//     "break",
//     "cacls",
//     "cd",
//     "chcp",
//     "chdir",
//     "chkdsk",
//     "chkntfs",
//     "cls",
//     "cmd",
//     "color",
//     "comp",
//     "compact",
//     "convert",
//     "date",
//     "dir",
//     "diskcomp",
//     "diskcopy",
//     "doskey",
//     "erase",
//     "fs",
//     "find",
//     "findstr",
//     "format",
//     "ftype",
//     "graftabl",
//     "help",
//     "keyb",
//     "label",
//     "md",
//     "mkdir",
//     "mode",
//     "more",
//     "move",
//     "path",
//     "pause",
//     "print",
//     "popd",
//     "pushd",
//     "promt",
//     "rd",
//     "recover",
//     "rem",
//     "rename",
//     "replace",
//     "restore",
//     "rmdir",
//     "shift",
//     "sort",
//     "start",
//     "subst",
//     "time",
//     "title",
//     "tree",
//     "type",
//     "ver",
//     "verify",
//     "vol",
//     // winutils
//     "ping",
//     "net",
//     "ipconfig",
//     "taskkill",
//     "xcopy",
//     "ren",
//     "del",
//   ];
  
//   const CMD_PROMPT = hljs.COMMENT(
//     /^[C-Z]:[a-zA-Z_ ~.\-\\]*/, />/,
//     { relevance: 1 }
//   );
//   const SPACE = {
//     begin: /(?=[^\n])\s/,
//     relevance: 0
//   };
//   const CMD_NAME = {
//     className: 'keyword',
//     begin: /\b/,       // /[a-zA-Z0-9_\-]+/, 
//     end: / |\n|$/,
//   };
//   const CMD_PARAM = {
//     className: 'params',
//     begin: /\b/, 
//     end: / |\n|$/,
//   };
//   const CMD = {
//     begin: /\s*/, 
//     end: /\n|$/,
    
//     excludeBegin: true,
//     excludeEnd: false,
//     // match: [
//     //   /[a-zA-Z0-9_\-]+/,
//     //   /\s+/,
//     //   /\n|$/
//     // ],
//     // returnBegin: true,
//     contains: [
//       // {match:[/\s*/]},
//       // {
//       //   begin: /(?=[^\n])\s/,
//       //   relevance: 0
//       // },
//       // SPACE,
//       CMD_NAME,
//       CMD_PARAM,
//     ]
//   };
//   const CMD_RESULT = {
//     begin: /.*/, 
//   };
//   const CMD_AND_RESULT = {
//     className: 'cmdandresult',
//     // convert this to negative lookbehind in v12
//     begin: /^[C-Z]:[a-zA-Z0-9_ ~.\\-\\\\]*/, // to match the cmd and result with
//     end: '\n',
//     excludeBegin: false,
//     excludeEnd: false,
//     // keywords: KEYWORDS$1,
//     returnBegin: true,
//     contains: [
//       CMD_PROMPT,
//       // SPACE,
//       CMD,
//       // CMD_RESULT,
//     ]
//   };
  
//   // hljs.COMMENT(
//   //   /^[C-Z]:[a-zA-Z_ ~.\-\\]*/, '', // /^[C-Z]:\\[a-zA-Z \-~_.]*/, />/,
//   //   { relevance: 1 }
//   // );

//   return {
//     name: 'command lines (DOS/bash/shell)',
//     aliases:["console","shellsession"],
//     case_insensitive: true,
//     // illegal: /\/\*/,
//     keywords: {
//       keyword: KEYWORDS,
//       built_in: BUILT_INS
//     },
//     contains: [
//       hljs.COMMENT(
//         /^\s{0,3}(?=[/~\w\d[\]()@\-\: ]*[ ]?[>%$#][ ]?)|^[C-Z]:[a-zA-Z_ ~.\-\\]*/,
//         /[ ]*[>%$#][ ]?|>/,
//         { relevance: 1 }
//       ),
//       // {
//       //   className: "comment",
//       //   begin:
//       //   end: // End of the prompt
//       // },

//       // {
//       //   // className:"comment",
//       //   begin:/^\s{0,3}(?=[/~\w\d[\]()@\-\: ]*[ ]?[>%$#][ ]?)/,
//       //   end:/[ ]*[>%$#][ ]?/, // End of the prompt
//       //   excludeEnd: true,
//       //   contains: [
//       //     {
//       //       className:"comment", // I've used this classNames because of the color of my theme. Probably not the best.
//       //       begin:/^[\w\d[\]()@\- ]*/, // Start of the prompt, usualy user@hostname
//       //     },
//       //     {
//       //       className:"meta",
//       //       excludeBegin: true,
//       //       excludeEnd: true,
//       //       begin:/\:/, // Second part of the prompt, usually where the current directory is shown.
//       //       end:/\ /, // In my case, there is a space before the end of the prompt.
//       //     },
//       //     {
//       //       className:"function",
//       //       begin:/\(/, // This is used to highlight the current branch in git, which is inside parenthesis.
//       //       end:/\)/,
//       //     }
//       //   ],
//       //   starts:{
//       //     end:/[^\\](?=\s*$)/,
//       //     subLanguage:"bash"
//       //   }
//       // },


//       // CMD_AND_RESULT,
//       // {
//       //   className: 'keyword',
//       //   begin: /\\s*bun\\s*/
//       // },
//       // {
//       //   className: 'variable',
//       //   begin: /%%[^ ]|%[^ ]+?%|![^ ]+?!/
//       // },
//       // {
//       //   className: 'function',
//       //   begin: LABEL.begin,
//       //   end: 'goto:eof',
//       //   contains: [
//       //     hljs.inherit(hljs.TITLE_MODE, { begin: '([_a-zA-Z]\\w*\\.)*([_a-zA-Z]\\w*:)?[_a-zA-Z]\\w*' }),
//       //     COMMENT
//       //   ]
//       // },
//       // {
//       //   className: 'number',
//       //   begin: '\\b\\d+',
//       //   relevance: 0
//       // },
//       // COMMENT
//     ]
//   };
// }
"object" == typeof exports && "undefined" != typeof module && (module.exports = cmdlines);
// module.exports = cmdlines;
