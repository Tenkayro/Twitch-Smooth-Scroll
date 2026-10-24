# Twitch Smooth Scroll

Ein schlankes Chrome-/Chromium-Addon, das neue Twitch-Chatnachrichten weich ins Bild scrollt.

- Autor: **Tenkayro**
- Manifest V3
- Mit normalem Twitch-Chat und 7TV nutzbar
- Pausiert automatisch, wenn man im Chat nach oben scrollt
- Verändert weder Nachrichten noch Emotes, Badges oder das 7TV-DOM

## Installation

1. In Chrome `chrome://extensions/` öffnen.
2. Oben rechts den **Entwicklermodus** aktivieren.
3. **Entpackte Erweiterung laden** wählen.
4. Diesen Ordner auswählen.
5. Eine bereits offene Twitch-Seite einmal neu laden.

Über das Erweiterungssymbol lässt sich Smooth Scroll an-/ausschalten und die Geschwindigkeit einstellen.

> Falls Twitch ToolKit parallel installiert bleibt, dort dessen eigene Option „Smooth Scrolling“ deaktivieren, damit nicht zwei Scroll-Animationen gleichzeitig laufen.

## Technischer Hinweis

Die Scroll-Idee und die kurze lineare Animation sind aus der lokal bereitgestellten Twitch-ToolKit-Version abgeleitet. Diese Erweiterung enthält ausschließlich die Smooth-Scroll-Funktion und besitzt eine eigene, auf Twitch-Navigation und 7TV ausgelegte Container-Erkennung.
