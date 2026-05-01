#!/usr/bin/env python3
"""Batch-update Chrome i18n locale files with native translations."""

from __future__ import annotations

import json
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
LOCALES_DIR: Final = ROOT / "public" / "_locales"

LOCALES: Final = [
    "ar",
    "bg",
    "ca",
    "de",
    "el",
    "en",
    "es",
    "fa",
    "fr",
    "hu",
    "id",
    "it",
    "ja",
    "ko",
    "nb",
    "nl",
    "pl",
    "pt_BR",
    "ro",
    "ru",
    "th",
    "tr",
    "uk",
    "vi",
    "zh_CN",
    "zh_TW",
]

UPDATES: Final = {
    "options_hide_download_bar_label": {
        "description": "Label for the optional browser download bar hiding setting.",
        "messages": {
            "ar": "إخفاء شريط تنزيلات المتصفح",
            "bg": "Скриване на лентата за изтегляния на браузъра",
            "ca": "Amaga la barra de baixades del navegador",
            "de": "Downloadleiste des Browsers ausblenden",
            "el": "Απόκρυψη της γραμμής λήψεων του προγράμματος περιήγησης",
            "en": "Hide Browser Download Bar",
            "es": "Ocultar la barra de descargas del navegador",
            "fa": "پنهان کردن نوار دانلود مرورگر",
            "fr": "Masquer la barre de téléchargements du navigateur",
            "hu": "Böngésző letöltési sávjának elrejtése",
            "id": "Sembunyikan Bilah Unduhan Browser",
            "it": "Nascondi la barra dei download del browser",
            "ja": "ブラウザーのダウンロードバーを非表示",
            "ko": "브라우저 다운로드 표시줄 숨기기",
            "nb": "Skjul nettleserens nedlastingslinje",
            "nl": "Downloadbalk van browser verbergen",
            "pl": "Ukryj pasek pobierania przeglądarki",
            "pt_BR": "Ocultar a barra de downloads do navegador",
            "ro": "Ascunde bara de descărcări a browserului",
            "ru": "Скрыть панель загрузок браузера",
            "th": "ซ่อนแถบดาวน์โหลดของเบราว์เซอร์",
            "tr": "Tarayıcı indirme çubuğunu gizle",
            "uk": "Приховати панель завантажень браузера",
            "vi": "Ẩn thanh tải xuống của trình duyệt",
            "zh_CN": "隐藏浏览器下载栏",
            "zh_TW": "隱藏瀏覽器下載列",
        },
    },
    "options_hide_download_bar_desc": {
        "description": "Description for the optional browser download bar hiding setting.",
        "messages": {
            "ar": "يطلب إذن واجهة التنزيل الاختياري قبل تغيير واجهة المتصفح",
            "bg": "Иска незадължително разрешение за интерфейса за изтегляния, преди да променя браузъра",
            "ca": "Demana el permís opcional de la interfície de baixades abans de canviar la interfície del navegador",
            "de": "Fordert die optionale Download-UI-Berechtigung an, bevor die Browseroberfläche geändert wird",
            "el": "Ζητά την προαιρετική άδεια διεπαφής λήψεων πριν αλλάξει τη διεπαφή του προγράμματος περιήγησης",
            "en": "Requests optional download UI permission before changing browser UI",
            "es": "Solicita el permiso opcional de interfaz de descargas antes de cambiar la interfaz del navegador",
            "fa": "پیش از تغییر رابط مرورگر، مجوز اختیاری رابط دانلود را درخواست می‌کند",
            "fr": "Demande l’autorisation facultative de l’interface de téléchargements avant de modifier l’interface du navigateur",
            "hu": "A böngésző felületének módosítása előtt opcionális letöltési felület engedélyt kér",
            "id": "Meminta izin UI unduhan opsional sebelum mengubah UI browser",
            "it": "Richiede l’autorizzazione opzionale dell’interfaccia download prima di modificare l’interfaccia del browser",
            "ja": "ブラウザー UI を変更する前に任意のダウンロード UI 権限を要求します",
            "ko": "브라우저 UI를 변경하기 전에 선택적 다운로드 UI 권한을 요청합니다",
            "nb": "Ber om valgfri tillatelse for nedlastingsgrensesnitt før nettlesergrensesnittet endres",
            "nl": "Vraagt optionele toestemming voor de downloadinterface voordat de browserinterface wordt gewijzigd",
            "pl": "Prosi o opcjonalne uprawnienie interfejsu pobierania przed zmianą interfejsu przeglądarki",
            "pt_BR": "Solicita a permissão opcional da interface de downloads antes de alterar a interface do navegador",
            "ro": "Solicită permisiunea opțională pentru interfața de descărcări înainte de a modifica interfața browserului",
            "ru": "Запрашивает необязательное разрешение интерфейса загрузок перед изменением интерфейса браузера",
            "th": "ขอสิทธิ์ UI ดาวน์โหลดแบบเลือกได้ก่อนเปลี่ยน UI ของเบราว์เซอร์",
            "tr": "Tarayıcı arayüzünü değiştirmeden önce isteğe bağlı indirme arayüzü izni ister",
            "uk": "Запитує необов’язковий дозвіл інтерфейсу завантажень перед зміною інтерфейсу браузера",
            "vi": "Yêu cầu quyền giao diện tải xuống tùy chọn trước khi thay đổi giao diện trình duyệt",
            "zh_CN": "更改浏览器界面前会请求可选的下载界面权限",
            "zh_TW": "變更瀏覽器介面前會要求選用的下載介面權限",
        },
    },
    "options_forward_cookies_label": {
        "description": "Label for the cookie forwarding setting.",
        "messages": {
            "ar": "إعادة توجيه ملفات تعريف الارتباط",
            "bg": "Препращане на бисквитки",
            "ca": "Reenvia les galetes",
            "de": "Cookies weiterleiten",
            "el": "Προώθηση cookies",
            "en": "Forward Cookies",
            "es": "Reenviar cookies",
            "fa": "ارسال کوکی‌ها",
            "fr": "Transférer les cookies",
            "hu": "Cookie-k továbbítása",
            "id": "Teruskan Cookie",
            "it": "Inoltra i cookie",
            "ja": "Cookie を転送",
            "ko": "쿠키 전달",
            "nb": "Videresend informasjonskapsler",
            "nl": "Cookies doorsturen",
            "pl": "Przekazuj pliki cookie",
            "pt_BR": "Encaminhar cookies",
            "ro": "Redirecționează cookie-uri",
            "ru": "Передавать cookie",
            "th": "ส่งต่อคุกกี้",
            "tr": "Çerezleri ilet",
            "uk": "Передавати cookie",
            "vi": "Chuyển tiếp cookie",
            "zh_CN": "转发 Cookie",
            "zh_TW": "轉送 Cookie",
        },
    },
    "options_forward_cookies_desc": {
        "description": "Description for the cookie forwarding setting.",
        "messages": {
            "ar": "يعيد توجيه ملفات تعريف الارتباط للتنزيلات التي تتطلب تسجيل الدخول",
            "bg": "Препраща бисквитки за удостоверени изтегляния",
            "ca": "Reenvia galetes per a baixades autenticades",
            "de": "Leitet Cookies für authentifizierte Downloads weiter",
            "el": "Προωθεί cookies για λήψεις με έλεγχο ταυτότητας",
            "en": "Forwards cookies for authenticated downloads",
            "es": "Reenvía cookies para descargas autenticadas",
            "fa": "کوکی‌ها را برای دانلودهای احراز هویت‌شده ارسال می‌کند",
            "fr": "Transfère les cookies pour les téléchargements authentifiés",
            "hu": "Cookie-kat továbbít a hitelesített letöltésekhez",
            "id": "Meneruskan cookie untuk unduhan terautentikasi",
            "it": "Inoltra i cookie per i download autenticati",
            "ja": "認証が必要なダウンロードの Cookie を転送します",
            "ko": "인증된 다운로드를 위해 쿠키를 전달합니다",
            "nb": "Videresender informasjonskapsler for autentiserte nedlastinger",
            "nl": "Stuurt cookies door voor geverifieerde downloads",
            "pl": "Przekazuje pliki cookie dla uwierzytelnionych pobrań",
            "pt_BR": "Encaminha cookies para downloads autenticados",
            "ro": "Redirecționează cookie-uri pentru descărcări autentificate",
            "ru": "Передает cookie для загрузок с авторизацией",
            "th": "ส่งต่อคุกกี้สำหรับการดาวน์โหลดที่ต้องยืนยันตัวตน",
            "tr": "Kimlik doğrulamalı indirmeler için çerezleri iletir",
            "uk": "Передає cookie для автентифікованих завантажень",
            "vi": "Chuyển tiếp cookie cho các lượt tải xuống đã xác thực",
            "zh_CN": "为需要登录的下载转发 Cookie",
            "zh_TW": "為需要驗證的下載轉送 Cookie",
        },
    },
    "options_permission_download_ui_denied": {
        "description": "Toast shown when the optional downloads.ui permission is denied.",
        "messages": {
            "ar": "امنح إذن واجهة التنزيلات لإخفاء شريط تنزيلات المتصفح.",
            "bg": "Разрешете интерфейса за изтегляния, за да скриете лентата за изтегляния на браузъра.",
            "ca": "Concedeix el permís de la interfície de baixades per amagar la barra de baixades del navegador.",
            "de": "Erteile die Download-UI-Berechtigung, um die Downloadleiste des Browsers auszublenden.",
            "el": "Παραχωρήστε την άδεια διεπαφής λήψεων για απόκρυψη της γραμμής λήψεων του προγράμματος περιήγησης.",
            "en": "Grant download UI permission to hide the browser download bar.",
            "es": "Concede el permiso de interfaz de descargas para ocultar la barra de descargas del navegador.",
            "fa": "برای پنهان کردن نوار دانلود مرورگر، مجوز رابط دانلود را بدهید.",
            "fr": "Accordez l’autorisation de l’interface de téléchargements pour masquer la barre de téléchargements du navigateur.",
            "hu": "Add meg a letöltési felület engedélyét a böngésző letöltési sávjának elrejtéséhez.",
            "id": "Berikan izin UI unduhan untuk menyembunyikan bilah unduhan browser.",
            "it": "Concedi l’autorizzazione dell’interfaccia download per nascondere la barra dei download del browser.",
            "ja": "ブラウザーのダウンロードバーを非表示にするには、ダウンロード UI 権限を許可してください。",
            "ko": "브라우저 다운로드 표시줄을 숨기려면 다운로드 UI 권한을 허용하세요.",
            "nb": "Gi tillatelse til nedlastingsgrensesnittet for å skjule nettleserens nedlastingslinje.",
            "nl": "Ge toestemming voor de downloadinterface om de downloadbalk van de browser te verbergen.",
            "pl": "Przyznaj uprawnienie interfejsu pobierania, aby ukryć pasek pobierania przeglądarki.",
            "pt_BR": "Conceda a permissão da interface de downloads para ocultar a barra de downloads do navegador.",
            "ro": "Acordă permisiunea pentru interfața de descărcări ca să ascunzi bara de descărcări a browserului.",
            "ru": "Разрешите интерфейс загрузок, чтобы скрыть панель загрузок браузера.",
            "th": "อนุญาตสิทธิ์ UI ดาวน์โหลดเพื่อซ่อนแถบดาวน์โหลดของเบราว์เซอร์",
            "tr": "Tarayıcı indirme çubuğunu gizlemek için indirme arayüzü izni verin.",
            "uk": "Надайте дозвіл інтерфейсу завантажень, щоб приховати панель завантажень браузера.",
            "vi": "Cấp quyền giao diện tải xuống để ẩn thanh tải xuống của trình duyệt.",
            "zh_CN": "请授予下载界面权限以隐藏浏览器下载栏。",
            "zh_TW": "請授予下載介面權限以隱藏瀏覽器下載列。",
        },
    },
    "options_permission_cookies_denied": {
        "description": "Toast shown when cookie forwarding permissions are unavailable.",
        "messages": {
            "ar": "امنح أذونات ملفات تعريف الارتباط والمواقع لإعادة توجيه ملفات تعريف الارتباط إلى Motrix Next.",
            "bg": "Разрешете бисквитки и сайтове, за да препращате бисквитки към Motrix Next.",
            "ca": "Concedeix permisos de galetes i llocs per reenviar galetes a Motrix Next.",
            "de": "Erteile Cookie- und Websiteberechtigungen, um Cookies an Motrix Next weiterzuleiten.",
            "el": "Παραχωρήστε άδειες cookies και ιστότοπων για προώθηση cookies στο Motrix Next.",
            "en": "Grant cookie and site permissions to forward cookies to Motrix Next.",
            "es": "Concede permisos de cookies y sitios para reenviar cookies a Motrix Next.",
            "fa": "برای ارسال کوکی‌ها به Motrix Next، مجوزهای کوکی و سایت را بدهید.",
            "fr": "Accordez les autorisations de cookies et de sites pour transférer les cookies vers Motrix Next.",
            "hu": "Add meg a cookie- és webhelyengedélyeket a cookie-k Motrix Next felé továbbításához.",
            "id": "Berikan izin cookie dan situs untuk meneruskan cookie ke Motrix Next.",
            "it": "Concedi le autorizzazioni per cookie e siti per inoltrare i cookie a Motrix Next.",
            "ja": "Cookie を Motrix Next に転送するには、Cookie とサイトの権限を許可してください。",
            "ko": "쿠키를 Motrix Next로 전달하려면 쿠키 및 사이트 권한을 허용하세요.",
            "nb": "Gi informasjonskapsel- og nettstedstillatelser for å videresende informasjonskapsler til Motrix Next.",
            "nl": "Ge cookie- en sitetoestemmingen om cookies naar Motrix Next door te sturen.",
            "pl": "Przyznaj uprawnienia do plików cookie i witryn, aby przekazywać pliki cookie do Motrix Next.",
            "pt_BR": "Conceda permissões de cookies e sites para encaminhar cookies ao Motrix Next.",
            "ro": "Acordă permisiuni pentru cookie-uri și site-uri ca să redirecționezi cookie-uri către Motrix Next.",
            "ru": "Разрешите cookie и сайты, чтобы передавать cookie в Motrix Next.",
            "th": "อนุญาตสิทธิ์คุกกี้และไซต์เพื่อส่งต่อคุกกี้ไปยัง Motrix Next",
            "tr": "Çerezleri Motrix Next’e iletmek için çerez ve site izinleri verin.",
            "uk": "Надайте дозволи cookie та сайтів, щоб передавати cookie до Motrix Next.",
            "vi": "Cấp quyền cookie và trang web để chuyển tiếp cookie tới Motrix Next.",
            "zh_CN": "请授予 Cookie 和站点权限以将 Cookie 转发给 Motrix Next。",
            "zh_TW": "請授予 Cookie 與網站權限，以將 Cookie 轉送至 Motrix Next。",
        },
    },
}


def validate_updates() -> None:
    expected = set(LOCALES)
    for key, payload in UPDATES.items():
        actual = set(payload["messages"].keys())
        if actual != expected:
            missing = sorted(expected - actual)
            extra = sorted(actual - expected)
            raise SystemExit(f"{key}: locale mismatch; missing={missing}, extra={extra}")


def write_locale(locale: str) -> None:
    path = LOCALES_DIR / locale / "messages.json"
    data = json.loads(path.read_text(encoding="utf-8"))

    for key, payload in UPDATES.items():
        data[key] = {
            "message": payload["messages"][locale],
            "description": payload["description"],
        }

    with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as tmp:
        json.dump(data, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def main() -> None:
    validate_updates()
    for locale in LOCALES:
        write_locale(locale)
    print(f"Updated {len(UPDATES)} keys across {len(LOCALES)} locales.")


if __name__ == "__main__":
    main()
