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
    tools: "Инструменты",
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
    clicks: "Клики",
    clicksHint: "Только переход по кнопке действия — промежуточные клики не считаются",
    funnel: "Доставка",
    ctr: "CTR",
    ctrOfImpressions: "от показов",
    creativeName: "Название",
    creativeNameHelp:
      "Необязательно. По умолчанию — название шаблона; пригодится, когда креативов из одного шаблона станет несколько.",
    createdAt: "Создан",
    openCreative: "Открыть",
    statsUnavailable:
      "Статистика сейчас недоступна, поэтому цифры и состояние отдачи скрыты — показывать неверные мы не будем. Обновите страницу через минуту; если не пройдёт, напишите нам.",
    viewableNotApplicable:
      "Измеряется вашим вендором верификации, а не нами",
    viewableSelfReported:
      "Собственная оценка, без аккредитации OMID",
    viewabilityHeading: "Измерение просмотра",
    createCreative: "Создать креатив",
    edit: "Изменить",
    saveChanges: "Сохранить изменения",
    vastTag: "VAST-тег",
    deleteCreative: "Удалить креатив",
    deleteConfirmTitle: "Удалить креатив?",
    // Says what is actually destroyed, and how fast. The earlier wording
    // promised "сразу", which the 60s CDN cache plus 30s stale-while-revalidate
    // on /api/vast cannot deliver, and never mentioned that the whole delivery
    // history goes with the creative — the thing a media buyer would most want
    // to be told before pressing an irreversible button.
    deleteConfirmBody:
      "Вместе с креативом безвозвратно удаляются вся статистика показов и загруженные файлы. Тег перестанет отдавать интерактивный payload в течение минуты.",
    deleteConfirmAction: "Удалить",
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
    errDeleteFailed:
      "Не удалось удалить креатив. Попробуйте ещё раз; если повторится — напишите нам.",
    media: {
      uploadTab: "Загрузить",
      urlTab: "Ссылка",
      chooseFile: "Выбрать файл",
      uploading: "Загружается…",
      uploaded: "Файл загружен",
      replace: "Заменить",
      errTooLarge: "Файл больше 25 МБ — уменьшите размер.",
      errWrongType: "Неподдерживаемый формат файла.",
      errUploadFailed: "Не удалось загрузить файл. Попробуйте ещё раз.",
    },
    // Section headings for a template's `config_schema` groups (ADR-0011).
    // Field *labels* are English-only DB data; a heading is prominent enough to
    // deserve the dictionary. Read through `groupLabel`, which falls back to the
    // raw group id so a new schema never renders an empty heading.
    groups: {
      quizFlow: "Структура",
      quizStep1: "Вопрос 1",
      quizStep2: "Вопрос 2",
      quizStep3: "Вопрос 3",
      quizResult: "Результат",
      quizOutcomes: "Исход по каждому пути",
      quizTag: "Переход по клику",
      viewability: "Верификация просмотра (OMID)",
    },
    outcomes: {
      complete: "Готов",
      empty: "Пусто",
      filled: "Заполнено",
      errIncomplete: "Заполните все обязательные поля этого исхода.",
    },
  },
  preview: {
    sameTag:
      "Один и тот же VAST-тег в трёх плеерах — как его загрузил бы настоящий DSP.",
    player: "Плеер",
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
    loadingUnit: "Загружаем интерактивный блок…",
    unitLoadFailed: "Не удалось загрузить интерактивный блок.",
    unitStartFailed: "Интерактивный блок не запустился.",
    playing: "Идёт показ",
    complete: "Досмотрено",
    sandboxVpaidOnly:
      "Песочница запускает только VPAID-блоки. Чтобы проверить SIMID, переключитесь на Google IMA или Fluid Player.",
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
      click: "клик",
      viewable: "просмотр",
    },
  },
  // The ad domain's only page. Read by ad ops who found this hostname in a tag
  // and need to know whose it is before whitelisting it — so it answers that
  // question first and sells nothing.
  cdn: {
    heading: "Домен доставки рекламы",
    whose:
      "Этот домен принадлежит AdInteract и используется только для доставки рекламы: VAST-теги, счётчики показов и файлы интерактивных креативов.",
    noSite:
      "Сайта здесь нет. Продукт и контакты — на основном домене.",
    whitelist:
      "Если вам нужно внести домен в whitelist, добавьте его целиком. Отдаются только рекламные ответы; ни авторизации, ни кук на этом домене нет.",
    goToSite: "Перейти на основной сайт",
  },
  tools: {
    title: "Бесплатные инструменты",
    subtitle:
      "Проверка и сборка VAST без регистрации. Ничего из проверенного мы у себя не храним.",
    columnTool: "Инструмент",
    columnState: "Состояние",
    stateAvailable: "Доступен",
    stateSoon: "В работе",
    open: "Открыть",
    generatorName: "Генератор VAST",
    generatorDescription:
      "Сборка корректного VAST-тега по параметрам: линейный ролик, обёртка, трекинг, интерактивный слой.",
    generatorSoonTitle: "Генератор ещё не готов",
    generatorSoonBody:
      "Сейчас в работе валидатор. Генератор появится следующим — он будет собирать VAST, который валидатор принимает без замечаний.",
    validatorName: "Валидатор VAST",
    validatorDescription:
      "Разбор тега или XML по спецификации IAB, прогон в реальном плеере и отчёт с ошибками и рекомендациями.",
    validator: {
      title: "Валидатор VAST",
      subtitle:
        "Вставьте ссылку на VAST-тег или тело документа. Инструмент разберёт структуру, пройдёт цепочку обёрток и запустит показ в плеере.",
      modeUrl: "Ссылка",
      modeXml: "XML",
      inputLabelUrl: "Ссылка на VAST",
      inputLabelXml: "Тело документа VAST",
      placeholderUrl: "https://adserver.example.com/vast?id=…",
      placeholderXml: "<VAST version=\"4.2\"> …",
      settings: "Параметры прогона",
      placement: "Формат показа",
      placementInstream: "Instream",
      placementOutstream: "Outstream",
      placementHint:
        "Instream — преролл перед контентным видео. Outstream — блок в потоке страницы, стартует при попадании в зону видимости.",
      pixels: "Трекинг-пиксели",
      pixelsDry: "Не отправлять",
      pixelsLive: "Отправлять",
      pixelsHintDry:
        "Пиксели подменяются на наш адрес и наружу не уходят: чужая статистика не сдвинется, бюджет не тратится. Скрипты верификации в этом режиме тоже не загружаются.",
      pixelsHintLive:
        "Тег проигрывается как есть — показы, квартили и клики засчитываются по-настоящему в тех системах, что указаны в теге.",
      vpaidMode: "Режим VPAID",
      vpaidEnabled: "Обычный",
      vpaidInsecure: "Небезопасный",
      vpaidDisabled: "Выключен",
      vpaidHint:
        "Плеер запускает VPAID-юниты в песочнице. Небезопасный режим даёт юниту доступ к странице — так его запускают многие продакшен-плееры.",
      run: "Проверить",
      running: "Проверяем",
      errEmptyUrl: "Вставьте ссылку на VAST-тег.",
      errEmptyXml: "Вставьте тело VAST-документа.",
      errBadUrl: "Это не похоже на абсолютный адрес. Ожидается http:// или https://.",
      errTooLarge: "Документ больше 256 КБ — столько мы не разбираем.",
      errRequest: "Не удалось выполнить проверку. Попробуйте ещё раз.",
      verdict: "Вердикт",
      verdictPass: "Пройдено",
      verdictWarn: "С замечаниями",
      verdictFail: "Не пройдено",
      // Nominative plural, and the count follows the word rather than
      // preceding it. "2 предупреждений" is ungrammatical, and getting Russian
      // numeral agreement right for an arbitrary count needs plural rules this
      // one readout does not justify; the instrument-panel order is correct for
      // every number and matches how every other metric on the site reads.
      countErrors: "Ошибки",
      countWarnings: "Предупреждения",
      countAdvisories: "Советы",
      severityError: "Ошибка",
      severityWarning: "Внимание",
      severityAdvisory: "Совет",
      summary: "Сводка",
      version: "Версия VAST",
      versionUnknown: "не объявлена",
      ads: "Объявлений",
      hops: "Переходов",
      downloaded: "Загружено",
      sectionInteractive: "Интерактивные стандарты",
      sectionFeatures: "Возможности",
      sectionFindings: "Находки",
      sectionTrackers: "Трекинг",
      sectionChain: "Цепочка обёрток",
      sectionRecommendations: "Рекомендации",
      sectionTimeline: "Ход проверки",
      sectionPlayer: "Показ",
      standard: "Стандарт",
      responded: "Ответ получен",
      ms: "мс",
      colFeature: "Возможность",
      colSince: "С версии",
      colFound: "В вашем теге",
      colWhere: "Где",
      colMessage: "Что не так",
      colEvent: "Событие",
      colUrl: "Адрес",
      colHop: "Хоп",
      colStatus: "Ответ",
      colTime: "Время",
      colSize: "Размер",
      colKind: "Тип",
      colSource: "Источник",
      found: "Есть",
      notFound: "Нет",
      unavailableAtVersion: "недоступно при объявленной версии",
      deprecatedIn: "устарело с",
      removedIn: "исключено в",
      noFindings: "Нарушений спецификации не найдено.",
      noTrackers: "Трекинговых адресов в теге нет.",
      noTimeline: "События появятся после запуска показа.",
      iabCode: "Код IAB",
      copyReport: "Скопировать отчёт",
      copiedReport: "Отчёт скопирован",
      downloadReport: "Скачать отчёт",
      downloadJson: "Скачать JSON",
      shareHint:
        "Отчёт существует только на этой странице — исходники мы не сохраняем. Скопируйте или скачайте его, чтобы передать коллеге.",
      startPlayback: "Запустить показ",
      restartPlayback: "Запустить заново",
      playerUnavailable:
        "Показ невозможен: из тега не удалось получить документ, пригодный для плеера.",
      pixelModeChanged:
        "Режим трекинг-пикселей изменён после проверки. Документ для плеера готовится в момент проверки, поэтому запустите её заново — иначе показ пошёл бы по прежним настройкам.",
      degradedNotice:
        "Анализ неполный: часть правил завершилась с ошибкой и не отработала. Отсутствие находок по ним не означает, что нарушений нет.",
      dryRunNotice:
        "Пиксели подменены — наружу ничего не уходит. В этом режиме документ отдаётся плееру с нашего домена, поэтому ошибка CORS, которая проявилась бы в бою, здесь не возникнет.",
      liveNotice: "Тег проигрывается как есть: все пиксели срабатывают по-настоящему.",
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
    tools: "Tools",
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
    clicks: "Clicks",
    clicksHint: "Final call-to-action only — intermediate clicks are not counted",
    funnel: "Delivery",
    ctr: "CTR",
    ctrOfImpressions: "of impressions",
    creativeName: "Name",
    creativeNameHelp:
      "Optional. Defaults to the template name; useful once one template has several creatives.",
    createdAt: "Created",
    openCreative: "Open",
    statsUnavailable:
      "Delivery numbers are unavailable right now, so counts and serving state are hidden rather than shown wrong. Refresh in a minute; if it persists, contact us.",
    viewableNotApplicable:
      "Measured by your verification vendor, not by us",
    viewableSelfReported: "Self-reported, not OMID-accredited",
    viewabilityHeading: "Viewability measurement",
    createCreative: "Create creative",
    edit: "Edit",
    saveChanges: "Save changes",
    vastTag: "VAST tag",
    deleteCreative: "Delete creative",
    deleteConfirmTitle: "Delete this creative?",
    deleteConfirmBody:
      "All delivery statistics and uploaded files are destroyed along with the creative, permanently. The tag stops serving the interactive payload within about a minute.",
    deleteConfirmAction: "Delete",
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
    errDeleteFailed:
      "Could not delete the creative. Try again; if it keeps failing, contact us.",
    media: {
      uploadTab: "Upload",
      urlTab: "URL",
      chooseFile: "Choose file",
      uploading: "Uploading…",
      uploaded: "File uploaded",
      replace: "Replace",
      errTooLarge: "File is larger than 25MB — reduce its size.",
      errWrongType: "Unsupported file type.",
      errUploadFailed: "Could not upload the file. Try again.",
    },
    groups: {
      quizFlow: "Structure",
      quizStep1: "Question 1",
      quizStep2: "Question 2",
      quizStep3: "Question 3",
      quizResult: "Result",
      quizOutcomes: "Result per answer path",
      quizTag: "Click-through",
      viewability: "Viewability verification (OMID)",
    },
    outcomes: {
      complete: "Ready",
      empty: "Empty",
      filled: "Filled",
      errIncomplete: "Fill in every required field in this outcome.",
    },
  },
  preview: {
    sameTag: "The same VAST tag in three players — what a real DSP would load.",
    player: "Player",
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
    loadingUnit: "Loading interactive unit…",
    unitLoadFailed: "Could not load the interactive unit.",
    unitStartFailed: "The interactive unit failed to start.",
    playing: "Playing",
    complete: "Complete",
    sandboxVpaidOnly:
      "The sandbox runs VPAID units only. Switch to Google IMA or Fluid Player to test SIMID.",
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
      click: "click",
      viewable: "viewable",
    },
  },
  cdn: {
    heading: "Ad delivery domain",
    whose:
      "This domain belongs to AdInteract and is used only to deliver advertising: VAST tags, impression counters, and interactive creative files.",
    noSite:
      "There is no website here. The product and its contacts live on the main domain.",
    whitelist:
      "If you need to whitelist this domain, add the whole host. It serves ad responses only — there is no sign-in and no cookie on it.",
    goToSite: "Go to the main site",
  },
  tools: {
    title: "Free tools",
    subtitle:
      "Check and build VAST without an account. Nothing you check is stored on our side.",
    columnTool: "Tool",
    columnState: "State",
    stateAvailable: "Available",
    stateSoon: "In progress",
    open: "Open",
    generatorName: "VAST generator",
    generatorDescription:
      "Build a correct VAST tag from parameters: linear spot, wrapper, tracking, interactive layer.",
    generatorSoonTitle: "The generator is not ready yet",
    generatorSoonBody:
      "The validator is what we are building now. The generator comes next, and it will produce VAST the validator accepts without a finding.",
    validatorName: "VAST validator",
    validatorDescription:
      "Parse a tag or document against the IAB specification, play it in a real player, and report every fault with a fix.",
    validator: {
      title: "VAST validator",
      subtitle:
        "Paste a VAST tag URL or the document itself. The tool parses the structure, walks the wrapper chain, and plays the ad in a real player.",
      modeUrl: "URL",
      modeXml: "XML",
      inputLabelUrl: "VAST tag URL",
      inputLabelXml: "VAST document body",
      placeholderUrl: "https://adserver.example.com/vast?id=…",
      placeholderXml: "<VAST version=\"4.2\"> …",
      settings: "Run settings",
      placement: "Placement",
      placementInstream: "Instream",
      placementOutstream: "Outstream",
      placementHint:
        "Instream is a preroll before content video. Outstream is an in-page slot that starts when it scrolls into view.",
      pixels: "Tracking pixels",
      pixelsDry: "Do not fire",
      pixelsLive: "Fire",
      pixelsHintDry:
        "Pixels are rewritten to our own address and never leave: nobody else's numbers move and no budget is spent. Verification scripts are not loaded in this mode either.",
      pixelsHintLive:
        "The tag plays as authored — impressions, quartiles and clicks are counted for real in whatever systems the tag names.",
      vpaidMode: "VPAID mode",
      vpaidEnabled: "Standard",
      vpaidInsecure: "Insecure",
      vpaidDisabled: "Disabled",
      vpaidHint:
        "The player sandboxes VPAID units by default. Insecure mode gives the unit access to the page, which is how many production players run it.",
      run: "Check",
      running: "Checking",
      errEmptyUrl: "Paste a VAST tag URL.",
      errEmptyXml: "Paste a VAST document body.",
      errBadUrl: "That does not look like an absolute address. http:// or https:// is expected.",
      errTooLarge: "The document is larger than 256 KB, which is more than we parse.",
      errRequest: "The check could not be completed. Try again.",
      verdict: "Verdict",
      verdictPass: "Pass",
      verdictWarn: "Pass with warnings",
      verdictFail: "Fail",
      countErrors: "Errors",
      countWarnings: "Warnings",
      countAdvisories: "Advisories",
      severityError: "Error",
      severityWarning: "Warning",
      severityAdvisory: "Advisory",
      summary: "Summary",
      version: "VAST version",
      versionUnknown: "not declared",
      ads: "Ads",
      hops: "Hops",
      downloaded: "Downloaded",
      sectionInteractive: "Interactive standards",
      sectionFeatures: "Capabilities",
      sectionFindings: "Findings",
      sectionTrackers: "Tracking",
      sectionChain: "Wrapper chain",
      sectionRecommendations: "Recommendations",
      sectionTimeline: "Run timeline",
      sectionPlayer: "Playback",
      standard: "Standard",
      responded: "Responded",
      ms: "ms",
      colFeature: "Capability",
      colSince: "Since",
      colFound: "In your tag",
      colWhere: "Where",
      colMessage: "What is wrong",
      colEvent: "Event",
      colUrl: "Address",
      colHop: "Hop",
      colStatus: "Status",
      colTime: "Time",
      colSize: "Size",
      colKind: "Kind",
      colSource: "Source",
      found: "Yes",
      notFound: "No",
      unavailableAtVersion: "unavailable at the declared version",
      deprecatedIn: "deprecated in",
      removedIn: "removed in",
      noFindings: "No specification violations found.",
      noTrackers: "The tag carries no tracking addresses.",
      noTimeline: "Events appear once playback starts.",
      iabCode: "IAB code",
      copyReport: "Copy report",
      copiedReport: "Report copied",
      downloadReport: "Download report",
      downloadJson: "Download JSON",
      shareHint:
        "The report exists only on this page — we keep no copy of what you checked. Copy or download it to pass it on.",
      startPlayback: "Start playback",
      restartPlayback: "Play again",
      playerUnavailable:
        "Playback is not possible: the tag yielded no document a player could use.",
      pixelModeChanged:
        "The tracking-pixel mode changed after the check. The document handed to the player is prepared at check time, so run the check again — otherwise playback would use the previous setting.",
      degradedNotice:
        "The analysis is incomplete: some rules threw and did not run. No finding from them does not mean there is no violation.",
      dryRunNotice:
        "Pixels are rewritten and nothing leaves. In this mode the document is served to the player from our own domain, so a CORS fault that would break the live run cannot appear here.",
      liveNotice: "The tag plays as authored: every pixel fires for real.",
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

/**
 * Heading for a `config_schema` group id (ADR-0011). Group ids come from the
 * database, so an unknown one degrades to the raw id rather than rendering a
 * headless section — the same contract `statusLabel` has for statuses.
 */
export function groupLabel(dict: Dict, id: string): string {
  const labels = dict.configurator.groups as Record<string, string | undefined>;
  return labels[id] ?? id;
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
