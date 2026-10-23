/**
 * Portuguese (Brazil) strings of the configuration portal: WiFiManager 2.0.17 with this file
 * selected by -DWM_STRINGS_FILE in platformio.ini. Based on the library's wm_strings_en.h
 * (MIT license, tzapu and tablatronix); the symbols must stay the same as in that file.
 *
 * Besides the translation, the Wi-Fi page gets a heading over the scanned networks: the user
 * taps a network or, when it is not listed, types its name.
 */

#ifndef WX_WM_STRINGS_PT_BR_H
#define WX_WM_STRINGS_PT_BR_H

#ifndef WIFI_MANAGER_OVERRIDE_STRINGS

// Tokens and routes of the library (not translated).
#include "wm_consts_en.h"

const char WM_LANGUAGE[] PROGMEM = "pt-BR";

const char HTTP_HEAD_START[]       PROGMEM = "<!DOCTYPE html>"
"<html lang='pt-BR'><head>"
"<meta name='format-detection' content='telephone=no'>"
"<meta charset='UTF-8'>"
"<meta  name='viewport' content='width=device-width,initial-scale=1,user-scalable=no'/>"
"<title>{v}</title>";

const char HTTP_SCRIPT[]           PROGMEM = "<script>function c(l){"
"document.getElementById('s').value=l.getAttribute('data-ssid')||l.innerText||l.textContent;"
"p = l.nextElementSibling.classList.contains('l');"
"document.getElementById('p').disabled = !p;"
"if(p)document.getElementById('p').focus();};"
"function f() {var x = document.getElementById('p');x.type==='password'?x.type='text':x.type='password';}"
// Typing a name re-enables the password field, which tapping an open network disables. The
// templates have no slot above the scanned networks: the heading goes in once the page loads.
// The TLS checkbox also moves the port between the standard ones (1883 and 8883): left at 8883
// with TLS off, the station would knock on a port the broker does not open without TLS.
"document.addEventListener('DOMContentLoaded',function(){var s=document.getElementById('s');"
"if(s)s.addEventListener('input',function(){document.getElementById('p').disabled=false;});"
"var t=document.getElementById('tls'),o=document.getElementById('port');"
"if(t&&o)t.addEventListener('change',function(){if(t.checked&&o.value=='1883')o.value='8883';"
"if(!t.checked&&o.value=='8883')o.value='1883';});"
"var a=document.querySelector('a[data-ssid]');if(!a)return;"
"var d=a.parentNode,h=document.createElement('p');h.className='lead';"
"h.innerHTML='<b>Redes encontradas</b><br/>Toque na sua rede. Se ela não aparecer, digite o nome no campo abaixo.';"
"d.parentNode.insertBefore(h,d);});"
"</script>";

const char HTTP_HEAD_END[]         PROGMEM = "</head><body class='{c}'><div class='wrap'>"; // {c} = _bodyclass
const char HTTP_ROOT_MAIN[]        PROGMEM = "<h1>{t}</h1><h3>{v}</h3>";

const char * const HTTP_PORTAL_MENU[] PROGMEM = {
"<form action='/wifi'    method='get'><button>Configurar Wi-Fi</button></form><br/>\n", // MENU_WIFI
"<form action='/0wifi'   method='get'><button>Configurar Wi-Fi (sem procurar redes)</button></form><br/>\n", // MENU_WIFINOSCAN
"<form action='/info'    method='get'><button>Informações</button></form><br/>\n", // MENU_INFO
"<form action='/param'   method='get'><button>Configuração</button></form><br/>\n",//MENU_PARAM
"<form action='/close'   method='get'><button>Fechar</button></form><br/>\n", // MENU_CLOSE
"<form action='/restart' method='get'><button>Reiniciar</button></form><br/>\n",// MENU_RESTART
"<form action='/exit'    method='get'><button>Sair</button></form><br/>\n",  // MENU_EXIT
"<form action='/erase'   method='get'><button class='D'>Apagar</button></form><br/>\n", // MENU_ERASE
"<form action='/update'  method='get'><button>Atualizar firmware</button></form><br/>\n",// MENU_UPDATE
"<hr><br/>" // MENU_SEP
};

const char HTTP_PORTAL_OPTIONS[]   PROGMEM = "";
const char HTTP_ITEM_QI[]          PROGMEM = "<div role='img' aria-label='{r}%' class='q q-{q} {i} {h}'></div>"; // rssi icons
const char HTTP_ITEM_QP[]          PROGMEM = "<div class='q {h}'>{r}%</div>"; // rssi percentage {h} = hidden showperc pref
// Without the hidden percentage ({qp}): a dozen networks around would add half a kilobyte.
const char HTTP_ITEM[]             PROGMEM = "<div><a href='#p' onclick='c(this)' data-ssid='{V}'>{v}</a>{qi}</div>"; // {q} = HTTP_ITEM_QI

const char HTTP_FORM_START[]       PROGMEM = "<form method='POST' action='{v}'>";
const char HTTP_FORM_WIFI[]        PROGMEM = "<label for='s'>Nome da rede (escolha na lista ou digite)</label><input id='s' name='s' maxlength='32' autocorrect='off' autocapitalize='none' placeholder='{v}'><br/><label for='p'>Senha do Wi-Fi</label><input id='p' name='p' maxlength='64' type='password' placeholder='{p}'><input type='checkbox' id='showpass' onclick='f()'> <label for='showpass'>Mostrar senha</label><br/>";
const char HTTP_FORM_WIFI_END[]    PROGMEM = "";
const char HTTP_FORM_STATIC_HEAD[] PROGMEM = "<hr><br/>";
const char HTTP_FORM_END[]         PROGMEM = "<br/><br/><button type='submit'>Salvar</button></form>";
const char HTTP_FORM_LABEL[]       PROGMEM = "<label for='{i}'>{t}</label>";
const char HTTP_FORM_PARAM_HEAD[]  PROGMEM = "<hr><h3>Conexão com o servidor</h3>";
const char HTTP_FORM_PARAM[]       PROGMEM = "<br/><input id='{i}' name='{n}' maxlength='{l}' value='{v}' {c}>\n"; // do not remove newline!

const char HTTP_SCAN_LINK[]        PROGMEM = "<br/><form action='/wifi?refresh=1' method='POST'><button name='refresh' value='1'>Procurar redes de novo</button></form>";
// The portal closes after saving (setBreakAfterConfig): a wrong Wi-Fi password is fixed by opening it again.
const char HTTP_SAVED[]            PROGMEM = "<div class='msg'>Configuração salva.<br/>A estação vai se conectar à rede escolhida e ao servidor.<br/>Se ela não aparecer online no painel em alguns minutos, abra este portal de novo com dois toques no botão RESET.</div>";
const char HTTP_PARAMSAVED[]       PROGMEM = "<div class='msg S'>Salvo<br/></div>";
const char HTTP_END[]              PROGMEM = "</div></body></html>";
const char HTTP_ERASEBTN[]         PROGMEM = "<br/><form action='/erase' method='get'><button class='D'>Apagar a configuração do Wi-Fi</button></form>";
const char HTTP_UPDATEBTN[]        PROGMEM = "<br/><form action='/update' method='get'><button>Atualizar firmware</button></form>";
const char HTTP_BACKBTN[]          PROGMEM = "<hr><br/><form action='/' method='get'><button>Voltar</button></form>";

const char HTTP_STATUS_ON[]        PROGMEM = "<div class='msg S'><strong>Conectada</strong> à rede {v}<br/><em><small>com o IP {i}</small></em></div>";
const char HTTP_STATUS_OFF[]       PROGMEM = "<div class='msg {c}'><strong>Sem conexão</strong> com a rede {v}{r}</div>"; // {c=class} {v=ssid} {r=status_off}
const char HTTP_STATUS_OFFPW[]     PROGMEM = "<br/>Senha incorreta"; // STATION_WRONG_PASSWORD,  no eps32
const char HTTP_STATUS_OFFNOAP[]   PROGMEM = "<br/>Rede não encontrada";   // WL_NO_SSID_AVAIL
const char HTTP_STATUS_OFFFAIL[]   PROGMEM = "<br/>Não foi possível conectar"; // WL_CONNECT_FAILED
const char HTTP_STATUS_NONE[]      PROGMEM = "<div class='msg'>Nenhuma rede Wi-Fi configurada</div>";
const char HTTP_BR[]               PROGMEM = "<br/>";

const char HTTP_STYLE[]            PROGMEM = "<style>"
".c,body{text-align:center;font-family:verdana}div,input,select{padding:5px;font-size:1em;margin:5px 0;box-sizing:border-box}"
"input,button,select,.msg{border-radius:.3rem;width: 100%}input[type=radio],input[type=checkbox]{width:auto}"
"button,input[type='button'],input[type='submit']{cursor:pointer;border:0;background-color:#1fa3ec;color:#fff;line-height:2.4rem;font-size:1.2rem;width:100%}"
".wrap {text-align:left;display:inline-block;min-width:260px;max-width:500px}"
".lead{margin:10px 0 15px}"
// links
"a{color:#000;font-weight:700;text-decoration:none}a:hover{color:#1fa3ec;text-decoration:underline}"
// quality icons (the @2x set is left out: every byte of a page is held in RAM while it is built)
".q{height:16px;margin:0;padding:0 5px;text-align:right;min-width:38px;float:right}.q.q-0:after{background-position-x:0}.q.q-1:after{background-position-x:-16px}.q.q-2:after{background-position-x:-32px}.q.q-3:after{background-position-x:-48px}.q.q-4:after{background-position-x:-64px}.q.l:before{background-position-x:-80px;padding-right:5px}.ql .q{float:left}.q:after,.q:before{content:'';width:16px;height:16px;display:inline-block;background-repeat:no-repeat;background-position: 16px 0;"
"background-image:url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAAAQCAMAAADeZIrLAAAAJFBMVEX///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADHJj5lAAAAC3RSTlMAIjN3iJmqu8zd7vF8pzcAAABsSURBVHja7Y1BCsAwCASNSVo3/v+/BUEiXnIoXkoX5jAQMxTHzK9cVSnvDxwD8bFx8PhZ9q8FmghXBhqA1faxk92PsxvRc2CCCFdhQCbRkLoAQ3q/wWUBqG35ZxtVzW4Ed6LngPyBU2CobdIDQ5oPWI5nCUwAAAAASUVORK5CYII=');}"
// msg callouts
".msg{padding:20px;margin:20px 0;border:1px solid #eee;border-left-width:5px;border-left-color:#777}.msg.D{border-left-color:#dc3630}.msg.S{border-left-color: #5cb85c}"
".h{display:none}"
"button{transition: 0s opacity;transition-delay: 3s;transition-duration: 0s;cursor: pointer}"
"button.D{background-color:#dc3630}"
"button:active{opacity:50% !important;cursor:wait;transition-delay: 0s}"
":disabled {opacity: 0.5;}"
"</style>";

// The help table lists developer routes; the portal of the station does not show it.
const char HTTP_HELP[]             PROGMEM = "";

const char HTTP_UPDATE[] PROGMEM = "Enviar novo firmware<br/><form method='POST' action='u' enctype='multipart/form-data' onchange=\"(function(el){document.getElementById('uploadbin').style.display = el.value=='' ? 'none' : 'initial';})(this)\"><input type='file' name='update' accept='.bin,application/octet-stream'><button id='uploadbin' type='submit' class='h D'>Atualizar</button></form><small><a href='http://192.168.4.1/update' target='_blank'>* Pode não funcionar dentro do portal: abra http://192.168.4.1 no navegador</a><small>";
const char HTTP_UPDATE_FAIL[] PROGMEM = "<div class='msg D'><strong>A atualização falhou.</strong><br/>Reinicie a estação e tente de novo.</div>";
const char HTTP_UPDATE_SUCCESS[] PROGMEM = "<div class='msg S'><strong>Atualização concluída.</strong><br/>A estação está reiniciando...</div>";

#ifdef WM_JSTEST
const char HTTP_JS[] PROGMEM = "";
#endif

// Info page
#ifdef ESP32
	const char HTTP_INFO_esphead[]    PROGMEM = "<h3>esp32</h3><hr><dl>";
	const char HTTP_INFO_chiprev[]    PROGMEM = "<dt>Revisão do chip</dt><dd>{1}</dd>";
	const char HTTP_INFO_lastreset[]  PROGMEM = "<dt>Motivo do último reset</dt><dd>CPU0: {1}<br/>CPU1: {2}</dd>";
	const char HTTP_INFO_aphost[]     PROGMEM = "<dt>Nome do ponto de acesso</dt><dd>{1}</dd>";
	const char HTTP_INFO_psrsize[]    PROGMEM = "<dt>Tamanho da PSRAM</dt><dd>{1} bytes</dd>";
	const char HTTP_INFO_temp[]       PROGMEM = "<dt>Temperatura</dt><dd>{1} C&deg; / {2} F&deg;</dd>";
	const char HTTP_INFO_hall[]       PROGMEM = "<dt>Hall</dt><dd>{1}</dd>";
#else
	const char HTTP_INFO_esphead[]    PROGMEM = "<h3>esp8266</h3><hr><dl>";
	const char HTTP_INFO_fchipid[]    PROGMEM = "<dt>ID do chip de flash</dt><dd>{1}</dd>";
	const char HTTP_INFO_corever[]    PROGMEM = "<dt>Versão do core</dt><dd>{1}</dd>";
	const char HTTP_INFO_bootver[]    PROGMEM = "<dt>Versão do boot</dt><dd>{1}</dd>";
	const char HTTP_INFO_lastreset[]  PROGMEM = "<dt>Motivo do último reset</dt><dd>{1}</dd>";
	const char HTTP_INFO_flashsize[]  PROGMEM = "<dt>Tamanho real da flash</dt><dd>{1} bytes</dd>";
#endif

const char HTTP_INFO_memsmeter[]  PROGMEM = "<br/><progress value='{1}' max='{2}'></progress></dd>";
const char HTTP_INFO_memsketch[]  PROGMEM = "<dt>Memória - programa</dt><dd>Usado / total (bytes)<br/>{1} / {2}";
const char HTTP_INFO_freeheap[]   PROGMEM = "<dt>Memória - heap livre</dt><dd>{1} bytes disponíveis</dd>";
const char HTTP_INFO_wifihead[]   PROGMEM = "<br/><h3>Wi-Fi</h3><hr>";
const char HTTP_INFO_uptime[]     PROGMEM = "<dt>Ligada há</dt><dd>{1} min {2} s</dd>";
const char HTTP_INFO_chipid[]     PROGMEM = "<dt>ID do chip</dt><dd>{1}</dd>";
const char HTTP_INFO_idesize[]    PROGMEM = "<dt>Tamanho da flash</dt><dd>{1} bytes</dd>";
const char HTTP_INFO_sdkver[]     PROGMEM = "<dt>Versão do SDK</dt><dd>{1}</dd>";
const char HTTP_INFO_cpufreq[]    PROGMEM = "<dt>Frequência da CPU</dt><dd>{1} MHz</dd>";
const char HTTP_INFO_apip[]       PROGMEM = "<dt>IP do ponto de acesso</dt><dd>{1}</dd>";
const char HTTP_INFO_apmac[]      PROGMEM = "<dt>MAC do ponto de acesso</dt><dd>{1}</dd>";
const char HTTP_INFO_apssid[]     PROGMEM = "<dt>Nome do ponto de acesso</dt><dd>{1}</dd>";
const char HTTP_INFO_apbssid[]    PROGMEM = "<dt>BSSID</dt><dd>{1}</dd>";
const char HTTP_INFO_stassid[]    PROGMEM = "<dt>Rede Wi-Fi</dt><dd>{1}</dd>";
const char HTTP_INFO_staip[]      PROGMEM = "<dt>IP na rede</dt><dd>{1}</dd>";
const char HTTP_INFO_stagw[]      PROGMEM = "<dt>Gateway</dt><dd>{1}</dd>";
const char HTTP_INFO_stasub[]     PROGMEM = "<dt>Máscara de sub-rede</dt><dd>{1}</dd>";
const char HTTP_INFO_dnss[]       PROGMEM = "<dt>Servidor DNS</dt><dd>{1}</dd>";
const char HTTP_INFO_host[]       PROGMEM = "<dt>Nome na rede</dt><dd>{1}</dd>";
const char HTTP_INFO_stamac[]     PROGMEM = "<dt>MAC na rede</dt><dd>{1}</dd>";
const char HTTP_INFO_conx[]       PROGMEM = "<dt>Conectada</dt><dd>{1}</dd>";
const char HTTP_INFO_autoconx[]   PROGMEM = "<dt>Conexão automática</dt><dd>{1}</dd>";

const char HTTP_INFO_aboutver[]     PROGMEM = "<dt>WiFiManager</dt><dd>{1}</dd>";
const char HTTP_INFO_aboutarduino[] PROGMEM = "<dt>Arduino</dt><dd>{1}</dd>";
const char HTTP_INFO_aboutsdk[]     PROGMEM = "<dt>ESP-SDK/IDF</dt><dd>{1}</dd>";
const char HTTP_INFO_aboutdate[]    PROGMEM = "<dt>Data da compilação</dt><dd>{1}</dd>";

const char S_brand[]              PROGMEM = "WiFiManager";
const char S_debugPrefix[]        PROGMEM = "*wm:";
const char S_y[]                  PROGMEM = "Sim";
const char S_n[]                  PROGMEM = "Não";
const char S_enable[]             PROGMEM = "Ativado";
const char S_disable[]            PROGMEM = "Desativado";
const char S_GET[]                PROGMEM = "GET";
const char S_POST[]               PROGMEM = "POST";
const char S_NA[]                 PROGMEM = "Desconhecido";
const char S_passph[]             PROGMEM = "********";
const char S_titlewifisaved[]     PROGMEM = "Configuração salva";
const char S_titlewifisettings[]  PROGMEM = "Configuração salva";
const char S_titlewifi[]          PROGMEM = "Configurar Wi-Fi";
const char S_titleinfo[]          PROGMEM = "Informações";
const char S_titleparam[]         PROGMEM = "Configuração";
const char S_titleparamsaved[]    PROGMEM = "Configuração salva";
const char S_titleexit[]          PROGMEM = "Sair";
const char S_titlereset[]         PROGMEM = "Reiniciar";
const char S_titleerase[]         PROGMEM = "Apagar";
const char S_titleclose[]         PROGMEM = "Fechar";
const char S_options[]            PROGMEM = "opções";
const char S_nonetworks[]         PROGMEM = "Nenhuma rede encontrada. Toque em \"Procurar redes de novo\" ou digite o nome da rede abaixo.";
const char S_staticip[]           PROGMEM = "IP fixo";
const char S_staticgw[]           PROGMEM = "Gateway fixo";
const char S_staticdns[]          PROGMEM = "DNS fixo";
const char S_subnet[]             PROGMEM = "Máscara de sub-rede";
const char S_exiting[]            PROGMEM = "Saindo";
const char S_resetting[]          PROGMEM = "A estação vai reiniciar em alguns segundos.";
const char S_closing[]            PROGMEM = "Pode fechar a página: o portal continua aberto";
const char S_error[]              PROGMEM = "Ocorreu um erro";
const char S_notfound[]           PROGMEM = "Página não encontrada\n\n";
const char S_uri[]                PROGMEM = "URI: ";
const char S_method[]             PROGMEM = "\nMétodo: ";
const char S_args[]               PROGMEM = "\nArgumentos: ";
const char S_parampre[]           PROGMEM = "param_";

// debug strings
const char D_HR[]                 PROGMEM = "--------------------";

// softap ssid default prefix
#ifdef ESP8266
    const char S_ssidpre[]        PROGMEM = "ESP";
#elif defined(ESP32)
    const char S_ssidpre[]        PROGMEM = "ESP32";
#else
    const char S_ssidpre[]        PROGMEM = "WM";
#endif

#endif  // WIFI_MANAGER_OVERRIDE_STRINGS

#endif  // WX_WM_STRINGS_PT_BR_H
