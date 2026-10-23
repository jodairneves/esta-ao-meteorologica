#include "local_page.h"

#include <ESP8266WiFi.h>

#include "core/html.h"

namespace wx {

namespace {

constexpr const char* kUser = "admin";

const char kHead[] PROGMEM =
    R"(<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">)"
    R"(<meta name="viewport" content="width=device-width,initial-scale=1"><title>Estação</title><style>)"
    R"(body{margin:0;font-family:system-ui,sans-serif;background:#f3f5f7;color:#1c2530})"
    R"(main{max-width:460px;margin:0 auto;padding:16px}h1{font-size:1.35em;margin:.3em 0 .6em})"
    R"(h2{font-size:1.05em;margin:1.5em 0 .3em}.box,.msg{background:#fff;border:1px solid #d9e0e7;)"
    R"(border-radius:8px;padding:10px 14px;margin:0 0 1em}.msg.bad{border-color:#f0b4ad})"
    R"(.ok{color:#1a7f37}.bad{color:#b42318}.note{color:#5b6672;font-size:.92em}p{margin:.4em 0})"
    R"(dl{display:grid;grid-template-columns:auto 1fr;gap:.25em .9em;margin:.5em 0 0}dt{color:#5b6672})"
    R"(dd{margin:0;overflow-wrap:anywhere}label{display:block;margin:.8em 0 .25em})"
    R"(input[type=text],input[type=number],input[type=password]{width:100%;box-sizing:border-box;)"
    R"(padding:.55em;border:1px solid #b8c3ce;border-radius:6px;font-size:1em})"
    R"(.check{display:flex;gap:.5em;align-items:center}button{margin-top:1.2em;width:100%;padding:.75em;)"
    R"(border:0;border-radius:6px;background:#1f5fbf;color:#fff;font-size:1em})"
    R"(button.secondary{background:#e2e7ed;color:#1c2530}</style></head><body><main>)";

const char kTail[] PROGMEM = "</main></body></html>";

// The form, in pieces around the values that change.
const char kFormHost[] PROGMEM =
    R"(<form method="post" action="/salvar"><h2>Servidor MQTT</h2>)"
    R"(<label for="host">Servidor</label><input id="host" name="host" type="text" required maxlength="63" )"
    R"(autocapitalize="none" autocorrect="off" spellcheck="false" value=")";
const char kFormPort[] PROGMEM =
    R"("><label for="port">Porta (1883 sem TLS, 8883 com TLS)</label>)"
    R"(<input id="port" name="port" type="number" min="1" max="65535" required value=")";
const char kFormTls[] PROGMEM = R"("><label class="check"><input id="tls" name="tls" type="checkbox" value="1")";
const char kFormCode[] PROGMEM =
    R"(> Conexão segura (TLS)</label><label for="code">Código da estação</label>)"
    R"(<input id="code" name="code" type="text" required pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]" )"
    R"(autocapitalize="none" autocorrect="off" spellcheck="false" value=")";
const char kFormUser[] PROGMEM =
    R"("><label for="user">Usuário MQTT</label><input id="user" name="user" type="text" maxlength="64" )"
    R"(autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="vazio usa o código da estação" )"
    R"(value=")";
const char kFormWifi[] PROGMEM =
    R"("><label for="password">Senha MQTT</label><input id="password" name="password" type="password" )"
    R"(maxlength="64" autocomplete="new-password" placeholder="vazio mantém a senha salva">)"
    R"(<h2>Wi-Fi</h2><p class="note">Preencha só para trocar de rede (2,4 GHz). Rede atual: )";
const char kFormEnd[] PROGMEM =
    R"(.</p><label for="ssid">Nome da rede</label><input id="ssid" name="ssid" type="text" maxlength="32" )"
    R"(autocapitalize="none" autocorrect="off" spellcheck="false"><label for="wifipass">Senha do Wi-Fi</label>)"
    R"(<input id="wifipass" name="wifipass" type="password" maxlength="64" autocomplete="new-password">)"
    R"(<p class="note">Se a estação não conectar com os dados novos em 2 minutos, ela volta sozinha )"
    R"(para os atuais.</p><input type="hidden" name="token" value=")";
const char kFormButtons[] PROGMEM =
    R"("><button>Salvar</button></form><form method="post" action="/reiniciar">)"
    R"(<input type="hidden" name="token" value=")";
const char kFormScript[] PROGMEM =
    R"("><button class="secondary">Reiniciar a estação</button></form><script>)"
    R"(var t=document.getElementById('tls'),o=document.getElementById('port');t.onchange=function(){)"
    R"(if(t.checked&&o.value=='1883')o.value='8883';if(!t.checked&&o.value=='8883')o.value='1883'};</script>)";

/** The failure in words a person can act on (a text in flash). */
PGM_P serverStatus(const LocalPageView& view) {
  if (view.mqttConnected) return PSTR("Conectada ao servidor.");
  // CONNACK 4 = bad username or password, 5 = not authorized; lwmqtt -3 = no TCP connection.
  if (view.mqttReturnCode == 4 || view.mqttReturnCode == 5) {
    return PSTR("O servidor recusou o código ou a senha MQTT.");
  }
  if (view.mqttError == -3) return PSTR("O servidor não respondeu: confira o endereço, a porta e o TLS.");
  return PSTR("Sem conexão com o servidor.");
}

}  // namespace

void LocalPage::begin(PasswordFn password, ViewFn view, SaveFn save, RestartFn restart) {
  password_ = std::move(password);
  view_ = std::move(view);
  save_ = std::move(save);
  restart_ = std::move(restart);
  snprintf_P(token_, sizeof(token_), PSTR("%08x%08x"), static_cast<unsigned>(ESP.random()),
             static_cast<unsigned>(ESP.random()));

  server_ = std::make_unique<ESP8266WebServer>(80);
  server_->on("/", HTTP_GET, [this] { handleRoot(); });
  server_->on("/salvar", HTTP_POST, [this] { handleSave(); });
  server_->on("/reiniciar", HTTP_POST, [this] { handleRestart(); });
  server_->onNotFound([this] { server_->send_P(404, PSTR("text/plain"), PSTR("Pagina nao encontrada")); });
  server_->begin();
}

void LocalPage::loop() {
  if (server_) server_->handleClient();
}

void LocalPage::stop() {
  if (!server_) return;
  server_->stop();
  server_.reset();
}

bool LocalPage::authorized() {
  if (server_->authenticate(kUser, password_())) return true;
  server_->requestAuthentication(BASIC_AUTH, "Estacao",
                                 F("Senha da pagina: no painel, na tela da estacao (Energia e sinal)."));
  return false;
}

bool LocalPage::validToken() { return server_->arg(F("token")) == token_; }

void LocalPage::start(int status) {
  // Chunked on HTTP/1.1; on HTTP/1.0 the answer ends when the connection closes.
  server_->setContentLength(CONTENT_LENGTH_UNKNOWN);
  server_->send_P(status, PSTR("text/html; charset=utf-8"), "");
  server_->sendContent_P(kHead);
}

void LocalPage::sendEscaped(const char* text) {
  char escaped[200];
  escapeHtml(text, escaped, sizeof(escaped));
  server_->sendContent(escaped);
}

void LocalPage::finish() {
  server_->sendContent_P(kTail);
  server_->chunkedResponseFinalize();
}

void LocalPage::sendPage(int status, PGM_P notice, bool noticeIsError) {
  const LocalPageView view = view_();
  const String ssid = WiFi.SSID();
  char text[96];

  start(status);
  server_->sendContent_P(PSTR("<h1>Estação "));
  sendEscaped(view.code);
  server_->sendContent_P(PSTR("</h1>"));

  if (notice != nullptr) {
    server_->sendContent_P(noticeIsError ? PSTR("<p class=\"msg bad\">") : PSTR("<p class=\"msg\">"));
    server_->sendContent_P(notice);
    server_->sendContent_P(PSTR("</p>"));
  }
  if (view.trialSecondsLeft > 0) {
    snprintf_P(text, sizeof(text), PSTR("Testando a configuração nova: faltam %u s. "),
               static_cast<unsigned>(view.trialSecondsLeft));
    server_->sendContent_P(PSTR("<p class=\"msg\">"));
    server_->sendContent(text);
    server_->sendContent_P(PSTR("Se não conectar, a estação volta para a anterior.</p>"));
  } else if (view.lastChange == LocalPageView::LastChange::Kept) {
    server_->sendContent_P(PSTR("<p class=\"msg\">A última alteração conectou e foi mantida.</p>"));
  } else if (view.lastChange == LocalPageView::LastChange::Reverted) {
    server_->sendContent_P(
        PSTR("<p class=\"msg bad\">A última alteração não conectou em 2 minutos e foi desfeita.</p>"));
  }

  server_->sendContent_P(view.mqttConnected ? PSTR("<div class=\"box\"><p class=\"ok\">")
                                            : PSTR("<div class=\"box\"><p class=\"bad\">"));
  server_->sendContent_P(serverStatus(view));
  server_->sendContent_P(PSTR("</p><dl><dt>IP</dt><dd>"));
  server_->sendContent(WiFi.localIP().toString());
  server_->sendContent_P(PSTR("</dd><dt>Wi-Fi</dt><dd>"));
  sendEscaped(ssid.c_str());
  snprintf_P(text, sizeof(text), PSTR(" (%d dBm)"), static_cast<int>(WiFi.RSSI()));
  server_->sendContent(text);
  server_->sendContent_P(PSTR("</dd><dt>Servidor</dt><dd>"));
  sendEscaped(view.host);
  snprintf_P(text, sizeof(text), view.tls ? PSTR(":%u, com TLS") : PSTR(":%u, sem TLS"),
             static_cast<unsigned>(view.port));
  server_->sendContent(text);
  server_->sendContent_P(PSTR("</dd><dt>Firmware</dt><dd>"));
  sendEscaped(view.firmware);
  server_->sendContent_P(PSTR("</dd></dl></div>"));

  server_->sendContent_P(kFormHost);
  sendEscaped(view.host);
  server_->sendContent_P(kFormPort);
  snprintf_P(text, sizeof(text), PSTR("%u"), static_cast<unsigned>(view.port));
  server_->sendContent(text);
  server_->sendContent_P(kFormTls);
  if (view.tls) server_->sendContent_P(PSTR(" checked"));
  server_->sendContent_P(kFormCode);
  sendEscaped(view.code);
  server_->sendContent_P(kFormUser);
  sendEscaped(view.user);
  server_->sendContent_P(kFormWifi);
  sendEscaped(ssid.c_str());
  server_->sendContent_P(kFormEnd);
  server_->sendContent(token_);
  server_->sendContent_P(kFormButtons);
  server_->sendContent(token_);
  server_->sendContent_P(kFormScript);
  finish();
}

void LocalPage::handleRoot() {
  if (!authorized()) return;
  sendPage(200, nullptr, false);
}

void LocalPage::handleSave() {
  if (!authorized()) return;
  if (!validToken()) {
    sendPage(403, PSTR("A página estava desatualizada: confira os dados e salve de novo."), true);
    return;
  }
  if (view_().changePending) {
    sendPage(409, PSTR("Espere o teste da alteração anterior terminar e tente de novo."), true);
    return;
  }
  const LocalFormParse parsed = parseLocalForm(
      server_->arg(F("host")).c_str(), server_->arg(F("port")).c_str(),
      server_->hasArg(F("tls")) ? server_->arg(F("tls")).c_str() : nullptr, server_->arg(F("code")).c_str(),
      server_->arg(F("user")).c_str(), server_->arg(F("password")).c_str(), server_->arg(F("ssid")).c_str(),
      server_->arg(F("wifipass")).c_str());
  if (!parsed.ok) {
    sendPage(400, parsed.error, true);
    return;
  }

  const bool newNetwork = parsed.form.ssid[0] != '\0';
  start(200);
  server_->sendContent_P(PSTR("<h1>Alteração salva</h1><div class=\"box\"><p>"));
  if (newNetwork) {
    server_->sendContent_P(
        PSTR("A estação vai trocar de rede agora, e esta página deixa de responder neste endereço. "
             "Se ela não conectar à rede nova em 2 minutos, volta sozinha para a atual.</p></div>"));
  } else {
    server_->sendContent_P(
        PSTR("A estação vai se conectar ao servidor com os dados novos. Se não conseguir em 2 minutos, "
             "volta sozinha para os atuais.</p></div><p class=\"note\">Esta página se atualiza em 20 "
             "segundos.</p><meta http-equiv=\"refresh\" content=\"20;url=/\">"));
  }
  finish();
  // Applied by the station a moment later, after this answer has left.
  save_(parsed.form);
}

void LocalPage::handleRestart() {
  if (!authorized()) return;
  if (!validToken()) {
    sendPage(403, PSTR("A página estava desatualizada: tente reiniciar de novo."), true);
    return;
  }
  start(200);
  server_->sendContent_P(
      PSTR("<h1>Reiniciando</h1><div class=\"box\"><p>A estação volta em alguns segundos.</p></div>"
           "<meta http-equiv=\"refresh\" content=\"20;url=/\">"));
  finish();
  restart_();
}

}  // namespace wx
