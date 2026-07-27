/**
 * UI copy for both shipped locales. Every user-visible string lives here —
 * a hardcoded human-readable literal in a component is a defect
 * (docs/design-system.md §8).
 *
 * `ru` is the shape of record; `en` is typed against it, so a key added to one
 * locale and forgotten in the other is a compile error.
 */
export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "adinteract_locale";

/** BCP-47 tags for Intl date/number formatting. */
export const LOCALE_TAG: Record<Locale, string> = {
  ru: "ru-RU",
  en: "en-US",
};

const ru = {
  brand: {
    name: "AdInteract",
    mark: "A",
  },
  common: {
    signIn: "Войти",
    signUp: "Регистрация",
    signOut: "Выйти",
    getStarted: "Начать",
    dashboard: "Кабинет",
    cancel: "Отмена",
    copyTag: "Копировать тег",
    tagCopied: "Тег скопирован",
    email: "Email",
    password: "Пароль",
    working: "Секунду…",
    checkoutError: "Не удалось открыть оплату. Попробуйте ещё раз.",
  },
  nav: {
    catalog: "Каталог",
    myCreatives: "Мои креативы",
    subscriptions: "Подписки",
    language: "Язык интерфейса",
  },
  landing: {
    title: "Интерактивные видеокреативы без единой строчки кода",
    subtitle:
      "Настройте шаблон, получите динамический VAST-тег и вставьте его в DSP. Поддерживаются SIMID и VPAID.",
    ctaStart: "Начать бесплатно",
    ctaDashboard: "Перейти в кабинет",
  },
  auth: {
    signInTitle: "Вход в AdInteract",
    signInSubtitle: "Управляйте своими интерактивными креативами.",
    signUpTitle: "Создание аккаунта",
    signUpSubtitle: "Начните собирать интерактивные креативы.",
    createAccount: "Создать аккаунт",
    checkEmail:
      "Подтвердите адрес по ссылке в письме, затем войдите.",
    noAccount: "Нет аккаунта?",
    createOne: "Создайте его",
    haveAccount: "Уже есть аккаунт?",
  },
  dashboard: {
    subscriptions: "Подписки",
    subscriptionsSubtitle:
      "План определяет, какие креативы отдаются прямо сейчас. Когда подписка заканчивается, тег перестаёт отдавать интерактивный payload.",
    singleTemplateHint:
      "Подписку на отдельный шаблон можно оформить на его странице в каталоге.",
    noSubscriptions:
      "Активных подписок нет. Оформите подписку, чтобы начать отдавать креативы.",
    ultimateTitle: "Ultimate — доступ ко всем шаблонам",
    ultimateSubtitle: "$30 в месяц · все шаблоны · 7 дней бесплатно",
    subscribe: "Подписаться",
    planUltimate: "Ultimate (все шаблоны)",
    planSingle: "Один шаблон",
    renews: "продление",
    endsOn: "завершается",
    checkoutSuccess:
      "Оплата получена. Подписка активируется, когда придёт подтверждение от Stripe — обновите страницу через минуту.",
    checkoutCancelled: "Оплата отменена — ничего не списано.",
    templates: "Шаблоны",
    configure: "Настроить креатив",
    perWeek: "$2 / неделя",
    perMonth: "$5 / месяц",
    noTemplates: "Пока ни один шаблон не опубликован.",
    creatives: "Креативы",
    creativesSubtitle:
      "Ваши собранные креативы, их VAST-теги и статистика показов.",
    noCreatives: "Креативов пока нет.",
    createFirst: "Соберите первый в каталоге",
    browseCatalog: "Открыть каталог",
    serving: "Отдаётся",
    notServing: "Не отдаётся",
    notServingHint: "Нужна активная подписка",
    onTrial: "триал",
    impressions: "Показы",
    starts: "Старты",
    completes: "Досмотры",
    funnel: "Воронка досмотра",
    creativeName: "Название",
    creativeNameHelp:
      "Необязательно. По умолчанию — название шаблона; пригодится, когда креативов из одного шаблона станет несколько.",
    createdAt: "Создан",
    openCreative: "Открыть",
    statsUnavailable:
      "Статистика сейчас недоступна, поэтому цифры и состояние отдачи скрыты — показывать неверные мы не будем. Обновите страницу через минуту; если не пройдёт, напишите нам.",
    createCreative: "Создать креатив",
    vastTag: "VAST-тег",
    template: "Шаблон",
    description: "Описание",
    format: "Формат",
    status: "Статус",
    plan: "План",
    period: "Период",
  },
  status: {
    active: "Live",
    trialing: "Триал",
    past_due: "Платёж не прошёл",
    canceled: "Отменена",
    incomplete: "Не завершена",
    unpaid: "Не оплачена",
    draft: "Черновик",
    ready: "Готов",
    paused: "На паузе",
  },
  configurator: {
    chooseTemplate: "Выберите шаблон",
    notFound: "Шаблон не найден.",
    backToTemplates: "Вернуться к шаблонам",
    configureTitle: "Настройка",
    configureSubtitle:
      "Заполните поля, выберите формат доставки и проверьте креатив в плеере перед сохранением.",
    deliveryFormat: "Формат доставки",
    noFields: "У этого шаблона нет настраиваемых полей.",
    required: "обязательное",
    errFormatRequired: "Выберите формат доставки — без него креатив не собрать.",
    errTemplateNotFound:
      "Шаблон не найден или снят с публикации. Выберите другой в каталоге.",
    errFieldRequired: "Заполните обязательное поле",
    errNameTooLong: "Название длиннее 200 символов — сократите его.",
    errSaveFailed:
      "Не удалось сохранить креатив. Попробуйте ещё раз; если повторится — напишите нам.",
  },
  preview: {
    sameTag:
      "Один и тот же VAST-тег в трёх плеерах — как его загрузил бы настоящий DSP.",
    launch: "Запустить рекламу",
    building: "Собираем VAST-тег…",
    restart: "Перезапустить",
    idleHint: "Заполните поля и запустите рекламу выше.",
    clickThrough: "Клик-через",
    errorStart:
      "Не удалось запустить превью. Проверьте обязательные поля и попробуйте снова.",
    errorReach:
      "Эндпоинт превью недоступен. Проверьте соединение и запустите снова.",
    ms: "мс",
    validFor: "Тег превью действителен ещё",
    seconds: "с",
    expired: "Тег превью истёк — нажмите «Перезапустить», чтобы получить новый.",
    served: "Реклама отдана",
    format: "Формат",
  },
  catalog: {
    title: "Каталог шаблонов",
    subtitle:
      "Интерактивные механики, готовые к запуску. Откройте любую и попробуйте руками.",
    empty: "Пока ни один шаблон не опубликован.",
    seeAll: "Весь каталог",
    standards: "Стандарты",
    demoTitle: "Как это работает",
    demoHint:
      "Пример с нейтральными заглушками — рекламодатель загружает свои изображения и ссылки.",
    heroHint:
      "Демонстрационные изображения — рекламодатель загружает свои.",
    heroSwitcher: "Переключатель шаблонов",
    noDemo:
      "Демо в браузере для этого шаблона пока нет. Механику можно собрать в конфигураторе и проверить в плеере.",
    configure: "Настроить креатив",
    signInToConfigure: "Создать аккаунт",
    subscribeWeekly: "Подписаться — $2 / неделя",
    subscribeMonthly: "Подписаться — $5 / месяц",
    backToCatalog: "Вернуться в каталог",
    hint: "Взаимодействуйте с креативом выше — сработавший клик-через появится здесь.",
    funnel: {
      impression: "показ",
      start: "старт",
      q25: "25%",
      q50: "50%",
      q75: "75%",
      complete: "досмотр",
    },
  },
};

// `ru` is the shape of record — no `as const`, so values widen to `string` and
// `en` is checked for the same *keys*, not the same literals.
type Dict = typeof ru;

const en: Dict = {
  brand: {
    name: "AdInteract",
    mark: "A",
  },
  common: {
    signIn: "Sign in",
    signUp: "Sign up",
    signOut: "Sign out",
    getStarted: "Get started",
    dashboard: "Dashboard",
    cancel: "Cancel",
    copyTag: "Copy tag",
    tagCopied: "Tag copied",
    email: "Email",
    password: "Password",
    working: "One moment…",
    checkoutError: "Could not open checkout. Try again.",
  },
  nav: {
    catalog: "Catalog",
    myCreatives: "My creatives",
    subscriptions: "Subscriptions",
    language: "Interface language",
  },
  landing: {
    title: "Interactive video ad creatives, without code",
    subtitle:
      "Configure a template, get a dynamic VAST tag for your DSP, and serve shoppable, interactive ads. SIMID and VPAID supported.",
    ctaStart: "Start free trial",
    ctaDashboard: "Go to dashboard",
  },
  auth: {
    signInTitle: "Sign in to AdInteract",
    signInSubtitle: "Manage your interactive ad creatives.",
    signUpTitle: "Create your account",
    signUpSubtitle: "Start building interactive ad creatives.",
    createAccount: "Create account",
    checkEmail: "Confirm your address from the email we sent, then sign in.",
    noAccount: "No account?",
    createOne: "Create one",
    haveAccount: "Already have an account?",
  },
  dashboard: {
    subscriptions: "Subscriptions",
    subscriptionsSubtitle:
      "Your plan decides which creatives serve right now. When a subscription lapses, the tag stops serving the interactive payload.",
    singleTemplateHint:
      "A single-template subscription is available on that template's catalog page.",
    noSubscriptions:
      "No active subscriptions. Subscribe to start serving creatives.",
    ultimateTitle: "Ultimate — all-access",
    ultimateSubtitle: "$30 per month · every template · 7-day free trial",
    subscribe: "Subscribe",
    planUltimate: "Ultimate (all-access)",
    planSingle: "Single template",
    renews: "renews",
    endsOn: "ends",
    checkoutSuccess:
      "Payment received. The subscription activates once Stripe confirms it — refresh in a minute.",
    checkoutCancelled: "Checkout cancelled — nothing was charged.",
    templates: "Templates",
    configure: "Configure creative",
    perWeek: "$2 / week",
    perMonth: "$5 / month",
    noTemplates: "No templates published yet.",
    creatives: "Creatives",
    creativesSubtitle:
      "The creatives you have built, their VAST tags, and their delivery numbers.",
    noCreatives: "No creatives yet.",
    createFirst: "Build the first one from the catalog",
    browseCatalog: "Open the catalog",
    serving: "Serving",
    notServing: "Not serving",
    notServingHint: "Needs an active subscription",
    onTrial: "trial",
    impressions: "Impressions",
    starts: "Starts",
    completes: "Completes",
    funnel: "Completion funnel",
    creativeName: "Name",
    creativeNameHelp:
      "Optional. Defaults to the template name; useful once one template has several creatives.",
    createdAt: "Created",
    openCreative: "Open",
    statsUnavailable:
      "Delivery numbers are unavailable right now, so counts and serving state are hidden rather than shown wrong. Refresh in a minute; if it persists, contact us.",
    createCreative: "Create creative",
    vastTag: "VAST tag",
    template: "Template",
    description: "Description",
    format: "Format",
    status: "Status",
    plan: "Plan",
    period: "Period",
  },
  status: {
    active: "Live",
    trialing: "Trial",
    past_due: "Payment failed",
    canceled: "Canceled",
    incomplete: "Incomplete",
    unpaid: "Unpaid",
    draft: "Draft",
    ready: "Ready",
    paused: "Paused",
  },
  configurator: {
    chooseTemplate: "Choose a template",
    notFound: "Template not found.",
    backToTemplates: "Back to templates",
    configureTitle: "Configure",
    configureSubtitle:
      "Fill in the fields, pick a delivery format, and try the creative in a player before saving.",
    deliveryFormat: "Delivery format",
    noFields: "This template has no configurable fields.",
    required: "required",
    errFormatRequired:
      "Pick a delivery format — the creative cannot be built without one.",
    errTemplateNotFound:
      "That template was not found or is no longer published. Pick another one in the catalog.",
    errFieldRequired: "Fill in the required field",
    errNameTooLong: "The name is longer than 200 characters — shorten it.",
    errSaveFailed:
      "Could not save the creative. Try again; if it keeps failing, contact us.",
  },
  preview: {
    sameTag: "The same VAST tag in three players — what a real DSP would load.",
    launch: "Launch ad",
    building: "Building the VAST tag…",
    restart: "Restart",
    idleHint: "Fill in the fields, then launch the ad above.",
    clickThrough: "Click-through",
    errorStart:
      "Could not start the preview. Check the required fields and try again.",
    errorReach:
      "Could not reach the preview endpoint. Check your connection and launch again.",
    ms: "ms",
    validFor: "Preview tag valid for another",
    seconds: "s",
    expired: "Preview tag expired — press Restart to mint a new one.",
    served: "Ad served",
    format: "Format",
  },
  catalog: {
    title: "Template catalog",
    subtitle:
      "Interactive mechanics ready to run. Open any of them and try it by hand.",
    empty: "No templates published yet.",
    seeAll: "Whole catalog",
    standards: "Standards",
    demoTitle: "How it works",
    demoHint:
      "A sample with neutral placeholders — advertisers supply their own images and links.",
    heroHint: "Demo imagery shown — advertisers supply their own.",
    heroSwitcher: "Template switcher",
    noDemo:
      "No in-browser demo for this template yet. You can still configure the mechanic and check it in a player.",
    configure: "Configure creative",
    signInToConfigure: "Create an account",
    subscribeWeekly: "Subscribe — $2 / week",
    subscribeMonthly: "Subscribe — $5 / month",
    backToCatalog: "Back to the catalog",
    hint: "Interact with the creative above — the click-through that fires shows up here.",
    funnel: {
      impression: "impression",
      start: "start",
      q25: "25%",
      q50: "50%",
      q75: "75%",
      complete: "complete",
    },
  },
};

export const dictionaries: Record<Locale, Dict> = { ru, en };
export type { Dict };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Subscription/creative status → label. Falls back to the raw value so a new
 * status coming from Stripe or the DB is never swallowed silently.
 */
export function statusLabel(dict: Dict, status: string): string {
  const labels = dict.status as Record<string, string | undefined>;
  return labels[status] ?? status;
}

/** Which semantic vocabulary a status belongs to (docs/design-system.md §3). */
export function statusTone(status: string): "live" | "info" | "dead" | "idle" {
  if (status === "active") return "live";
  if (status === "trialing") return "info";
  if (status === "past_due" || status === "unpaid" || status === "incomplete")
    return "dead";
  if (status === "canceled") return "dead";
  return "idle";
}
