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
export const LOCALE_COOKIE = "creosmith_locale";

/**
 * The pre-rename cookie name, read as a fallback so the AdInteract → CreoSmith
 * rename does not silently reset every existing visitor to `DEFAULT_LOCALE`
 * ("en"): a Russian user who had chosen RU would otherwise come back to an
 * English UI with nothing to explain it.
 *
 * Read-only and never written — the switcher writes `LOCALE_COOKIE` alone, so a
 * visitor migrates the first time they touch the control. Delete this once the
 * old cookies have aged out (they were written with a 1-year max-age, so any
 * time after August 2027).
 */
export const LEGACY_LOCALE_COOKIE = "adinteract_locale";

/** BCP-47 tags for Intl date/number formatting. */
export const LOCALE_TAG: Record<Locale, string> = {
  ru: "ru-RU",
  en: "en-US",
};

const ru = {
  brand: {
    nameLead: "Creo",
    nameTail: "Smith",
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
    menu: "Меню",
  },
  meta: {
    title: "CreoSmith — интерактивные видеокреативы",
    description:
      "Соберите интерактивный видеокреатив без разработчика и заберите динамический VAST-тег для любого DSP. SIMID 1.1 и VPAID 2.0.",
  },
  landing: {
    eyebrow: "Интерактивные видеокреативы",
    title: "Реклама, с которой зритель что-то делает",
    subtitle:
      "Выберите шаблон, настройте под кампанию и заберите динамический VAST-тег. SIMID 1.1 и VPAID 2.0 — вставляется в любой DSP без разработчика.",
    ctaStart: "Начать бесплатно",
    ctaDashboard: "Перейти в кабинет",
    ctaTemplates: "Смотреть шаблоны",
    heroNote: "7 дней бесплатно · правка креатива не требует перевыпуска тега",

    howEyebrow: "Как это работает",
    howTitle: "От шаблона до тега в DSP — четыре шага",
    howLead:
      "Ни один из них не требует разработчика. Правка в креативе не заставляет перевыпускать тег — кампания продолжает идти.",
    step1Title: "Выберите шаблон",
    step1Body:
      "Пять механик: шоппинг, скретч, до/после, квиз и возрастной гейт.",
    step2Title: "Настройте под кампанию",
    step2Body:
      "Видео, изображения, ссылка перехода, тексты кнопок. Превью обновляется сразу.",
    step3Title: "Заберите VAST-тег",
    step3Body:
      "Один динамический URL. Формат отдачи выбираете вы — SIMID или VPAID.",
    step4Title: "Вставьте в DSP",
    step4Body:
      "Тег отдаёт интерактив, пока активна подписка. Дальше — обычная закупка.",
    tagLabel: "Ваш тег",

    templatesEyebrow: "Шаблоны",
    templatesTitle: "Пять механик, готовых к запуску",
    customTitle: "Нужна своя механика?",
    customBody: "Соберём шаблон под вашу кампанию и добавим его в каталог.",

    stdEyebrow: "Совместимость",
    stdTitle: "Стандарты, а не костыли",
    stdLead:
      "Мы отдаём то, что DSP уже умеет читать. Никаких собственных плееров и обёрток на стороне площадки.",
    stdVast: "Формат тега",
    stdSimid: "Интерактив нового поколения",
    stdVpaid: "Совместимость с текущим парком",
    stdOmid: "Проброс верификации вендора",

    toolsEyebrow: "Бесплатно, без аккаунта",
    toolsTitle: "Инструменты, которыми пользуются и не наши клиенты",

    finalTitle: "Соберите первый креатив сегодня",
    finalBody:
      "Семь дней бесплатно, все шаблоны открыты. Тег живёт, пока активна подписка.",
    ctaCheckTag: "Проверить свой тег",
  },
  footer: {
    tagline:
      "Интерактивные видеокреативы и динамические VAST-теги для медиабайеров и креативных агентств.",
    product: "Продукт",
    tools: "Инструменты",
    standards: "Стандарты",
    howItWorks: "Как это работает",
    rights: "© 2026 CreoSmith",
  },
  auth: {
    signInTitle: "Вход в CreoSmith",
    signInSubtitle: "Управляйте своими интерактивными креативами.",
    signUpTitle: "Создание аккаунта",
    signUpSubtitle: "Начните собирать интерактивные креативы.",
    createAccount: "Создать аккаунт",
    checkEmail: "Подтвердите адрес по ссылке в письме, затем войдите.",
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
    clicksHint:
      "Только переход по кнопке действия — промежуточные клики не считаются",
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
    viewableNotApplicable: "Измеряется вашим вендором верификации, а не нами",
    viewableSelfReported: "Собственная оценка, без аккредитации OMID",
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
    errFormatRequired:
      "Выберите формат доставки — без него креатив не собрать.",
    errTemplateNotFound:
      "Шаблон не найден или снят с публикации. Выберите другой в каталоге.",
    errFieldRequired: "Заполните обязательное поле",
    errNameTooLong: "Название длиннее 200 символов — сократите его.",
    errSaveFailed:
      "Не удалось сохранить креатив. Попробуйте ещё раз; если повторится — напишите нам.",
    errDeleteFailed:
      "Не удалось удалить креатив. Попробуйте ещё раз; если повторится — напишите нам.",
    media: {
      sourceLabel: "Источник файла",
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
    expired:
      "Тег превью истёк — нажмите «Перезапустить», чтобы получить новый.",
    served: "Реклама отдана",
    format: "Формат",
    loadingUnit: "Загружаем интерактивный блок…",
    unitLoadFailed: "Не удалось загрузить интерактивный блок.",
    unitStartFailed: "Интерактивный блок не запустился.",
    loadingIma: "Загружаем Google IMA SDK…",
    imaSdkBlocked:
      "Google IMA SDK заблокирован браузером — так делают блокировщики рекламы и расширения приватности. Креатив при этом исправен: вкладка Sandbox не обращается к IMA. Разрешите адрес для этого сайта и перезапустите:",
    imaRunFailed: "Google IMA SDK загрузился, но реклама не запустилась:",
    imaStartFailed: "Google IMA SDK не смог запустить рекламу.",
    tagFetchFailed: "Не удалось получить VAST-тег превью.",
    adError: "Ошибка рекламы",
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
    heroHint: "Демонстрационные изображения — рекламодатель загружает свои.",
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
      "Этот домен принадлежит CreoSmith и используется только для доставки рекламы: VAST-теги, счётчики показов и файлы интерактивных креативов.",
    noSite: "Сайта здесь нет. Продукт и контакты — на основном домене.",
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
    playerFrame: "Плеер VAST",
    validatorMetaTitle: "Валидатор VAST — проверить и проиграть тег",
    validatorMetaDescription:
      "Вставьте URL или XML VAST-тега. Проверяем по спецификации IAB, проходим цепочку враппера, проигрываем в Google IMA и показываем каждую ошибку с исправлением. VPAID, SIMID и OMID включены. Бесплатно, без аккаунта.",
    generatorMetaTitle: "Генератор VAST-тегов",
    generatorMetaDescription:
      "Собирает корректный VAST из ваших параметров, когда нужен тестовый тег на пять минут. Бесплатно, без аккаунта.",
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
      placeholderXml: '<VAST version="4.2"> …',
      pixels: "Трекинг-пиксели",
      pixelsDry: "Не отправлять",
      pixelsLive: "Отправлять",
      run: "Проверить",
      running: "Проверяем",
      errEmptyUrl: "Вставьте ссылку на VAST-тег.",
      errEmptyXml: "Вставьте тело VAST-документа.",
      errBadUrl:
        "Это не похоже на абсолютный адрес. Ожидается http:// или https://.",
      errTooLarge: "Документ больше 256 КБ — столько мы не разбираем.",
      errRequest: "Не удалось выполнить проверку. Попробуйте ещё раз.",
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
      version: "Версия VAST",
      versionUnknown: "не объявлена",
      ads: "Объявлений",
      hops: "Переходов",
      downloaded: "Загружено",
      sectionInteractive: "Интерактивные стандарты",
      sectionFeatures: "Возможности",
      sectionChain: "Цепочка обёрток",
      sectionRecommendations: "Рекомендации",
      sectionTimeline: "Ход проверки",
      standard: "Стандарт",
      responded: "Ответ получен",
      ms: "мс",
      colFeature: "Возможность",
      colSince: "С версии",
      colFound: "В вашем теге",
      colWhere: "Где",
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
      noTimeline: "События появятся после запуска показа.",
      iabCode: "Код IAB",
      playerUnavailable:
        "Показ невозможен: из тега не удалось получить документ, пригодный для плеера.",
      pixelsHelp:
        "«Не отправлять» — пиксели подменяются на наш адрес: чужая статистика не сдвинется и бюджет не потратится, скрипты верификации не загрузятся. «Отправлять» — тег играет как есть, показы, квартили и клики засчитываются по-настоящему в тех системах, что указаны в теге.",
      inputHelp:
        "Отчёт живёт только на этой странице — ни ссылку, ни тело документа мы не сохраняем. Проверенная ссылка попадает в адресную строку, так что страницу можно передать коллеге или положить в закладки.",
      recommendationsHelp:
        "Ошибка — нарушение объявленной версии спецификации. Внимание — формально допустимо, но ломается у части плееров и площадок. Совет — возможность, которой тег не пользуется.",
      colTracker: "Трекер",
      trackerHelp:
        "Адрес из самого тега — то, что ушло бы в бою. Плеер не сообщает, какой именно URL он дёрнул, поэтому строка сопоставлена с событием по имени, а не по факту запроса.",
      trackersUnfired: "Объявлены, но не сработали",
      sectionReference: "Разбор документа",
      wellIdle: "Плеер запустится сразу после нажатия «Проверить».",
      inputMode: "Способ ввода",
      sectionComparison: "XML против плеера",
      // Units are interface text, not machine values: `256 КБ` in an error message and
      // `256 KB` in the table beside it is the same screen speaking two languages.
      unitSeconds: "с",
      unitBytes: "Б",
      unitKb: "КБ",
      unitMb: "МБ",
      sandboxUnavailable:
        "Показ отключён: не настроен отдельный домен для плеера. Тег исполняет чужой JavaScript, поэтому мы запускаем его только в изолированном origin — иначе креатив получил бы доступ к этой странице и к вашей сессии. Отчёт выше собран на сервере и остаётся верным.",
      sdkBlocked:
        "Google IMA SDK заблокирован браузером — так делают блокировщики рекламы и расширения приватности. Это мешает только показу: отчёт выше собран на сервере и остаётся верным. Разрешите адрес для этого сайта и запустите показ заново:",
      degradedNotice:
        "Анализ неполный: часть правил завершилась с ошибкой и не отработала. Отсутствие находок по ним не означает, что нарушений нет.",
    },
  },
};

// `ru` is the shape of record — no `as const`, so values widen to `string` and
// `en` is checked for the same *keys*, not the same literals.
type Dict = typeof ru;

const en: Dict = {
  brand: {
    nameLead: "Creo",
    nameTail: "Smith",
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
    menu: "Menu",
  },
  meta: {
    title: "CreoSmith — interactive video ad creatives",
    description:
      "Build an interactive video creative without a developer and take a dynamic VAST tag for any DSP. SIMID 1.1 and VPAID 2.0.",
  },
  landing: {
    eyebrow: "Interactive video creative",
    title: "Ads your viewer actually touches",
    subtitle:
      "Pick a template, tune it to the campaign, take the dynamic VAST tag. SIMID 1.1 and VPAID 2.0 — it pastes into any DSP, with no developer.",
    ctaStart: "Start free trial",
    ctaDashboard: "Go to dashboard",
    ctaTemplates: "See the templates",
    heroNote: "7 days free · editing a creative never reissues the tag",

    howEyebrow: "How it works",
    howTitle: "Template to DSP tag in four steps",
    howLead:
      "None of them needs a developer. Editing a creative does not force a new tag — the campaign keeps running.",
    step1Title: "Pick a template",
    step1Body:
      "Five mechanics: shoppable, scratch, before/after, quiz, and an age gate.",
    step2Title: "Tune it to the campaign",
    step2Body:
      "Video, images, click-through, button copy. The preview updates as you type.",
    step3Title: "Take the VAST tag",
    step3Body:
      "One dynamic URL. You choose the delivery format — SIMID or VPAID.",
    step4Title: "Paste it into your DSP",
    step4Body:
      "The tag serves the interactive payload while the subscription is active. The rest is ordinary buying.",
    tagLabel: "Your tag",

    templatesEyebrow: "Templates",
    templatesTitle: "Five mechanics, ready to run",
    customTitle: "Need a mechanic of your own?",
    customBody:
      "We will build the template around your campaign and add it to the catalog.",

    stdEyebrow: "Compatibility",
    stdTitle: "Standards, not workarounds",
    stdLead:
      "We serve what a DSP already knows how to read. No player of our own, no wrapper on the publisher's side.",
    stdVast: "Tag format",
    stdSimid: "Next-generation interactivity",
    stdVpaid: "Works with the installed base",
    stdOmid: "Vendor verification pass-through",

    toolsEyebrow: "Free, no account",
    toolsTitle: "Tools people who aren't our customers use anyway",

    finalTitle: "Build your first creative today",
    finalBody:
      "Seven days free, every template open. The tag lives as long as the subscription does.",
    ctaCheckTag: "Check your own tag",
  },
  footer: {
    tagline:
      "Interactive video creative and dynamic VAST tags for media buyers and creative agencies.",
    product: "Product",
    tools: "Tools",
    standards: "Standards",
    howItWorks: "How it works",
    rights: "© 2026 CreoSmith",
  },
  auth: {
    signInTitle: "Sign in to CreoSmith",
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
    clicksHint:
      "Final call-to-action only — intermediate clicks are not counted",
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
    viewableNotApplicable: "Measured by your verification vendor, not by us",
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
      sourceLabel: "File source",
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
    loadingIma: "Loading the Google IMA SDK…",
    imaSdkBlocked:
      "The Google IMA SDK was blocked by the browser — ad blockers and privacy extensions do this. The creative itself is fine: the Sandbox tab never reaches for IMA. Allow the address for this site and restart:",
    imaRunFailed: "The Google IMA SDK loaded, but the ad did not start:",
    imaStartFailed: "The Google IMA SDK failed to start the ad.",
    tagFetchFailed: "Could not fetch the preview VAST tag.",
    adError: "Ad error",
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
      "This domain belongs to CreoSmith and is used only to deliver advertising: VAST tags, impression counters, and interactive creative files.",
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
    playerFrame: "VAST player",
    validatorMetaTitle: "VAST validator — check and play a VAST tag",
    validatorMetaDescription:
      "Paste a VAST tag URL or XML. Checks it against the IAB specification, walks the wrapper chain, plays it in Google IMA, and reports every fault with a fix. VPAID, SIMID and OMID included. Free, no account.",
    generatorMetaTitle: "VAST tag generator",
    generatorMetaDescription:
      "Builds a correct VAST tag from your parameters, for when you need a test tag in five minutes. Free, no account.",
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
      placeholderXml: '<VAST version="4.2"> …',
      pixels: "Tracking pixels",
      pixelsDry: "Do not fire",
      pixelsLive: "Fire",
      run: "Check",
      running: "Checking",
      errEmptyUrl: "Paste a VAST tag URL.",
      errEmptyXml: "Paste a VAST document body.",
      errBadUrl:
        "That does not look like an absolute address. http:// or https:// is expected.",
      errTooLarge:
        "The document is larger than 256 KB, which is more than we parse.",
      errRequest: "The check could not be completed. Try again.",
      verdictPass: "Pass",
      verdictWarn: "Pass with warnings",
      verdictFail: "Fail",
      countErrors: "Errors",
      countWarnings: "Warnings",
      countAdvisories: "Advisories",
      severityError: "Error",
      severityWarning: "Warning",
      severityAdvisory: "Advisory",
      version: "VAST version",
      versionUnknown: "not declared",
      ads: "Ads",
      hops: "Hops",
      downloaded: "Downloaded",
      sectionInteractive: "Interactive standards",
      sectionFeatures: "Capabilities",
      sectionChain: "Wrapper chain",
      sectionRecommendations: "Recommendations",
      sectionTimeline: "Run timeline",
      standard: "Standard",
      responded: "Responded",
      ms: "ms",
      colFeature: "Capability",
      colSince: "Since",
      colFound: "In your tag",
      colWhere: "Where",
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
      noTimeline: "Events appear once playback starts.",
      iabCode: "IAB code",
      playerUnavailable:
        "Playback is not possible: the tag yielded no document a player could use.",
      pixelsHelp:
        "“Do not fire” rewrites every pixel to our own address: nobody else’s numbers move, no budget is spent, and verification scripts are not loaded. “Fire” plays the tag as authored — impressions, quartiles and clicks are counted for real in whatever systems the tag names.",
      inputHelp:
        "The report lives only on this page — we keep no copy of the URL or the document. A checked URL goes into the address bar, so the page can be passed to a colleague or bookmarked.",
      recommendationsHelp:
        "Error — a violation of the declared specification. Warning — formally allowed, but broken on part of the market. Advisory — a capability the tag does not use.",
      colTracker: "Tracker",
      trackerHelp:
        "The address from the tag itself — what would fire in production. No player reports which URL it actually requested, so the row is matched to the event by name rather than by observation.",
      trackersUnfired: "Declared but never fired",
      sectionReference: "Document detail",
      wellIdle: "The player starts as soon as you press Check.",
      inputMode: "Input mode",
      sectionComparison: "XML versus player",
      unitSeconds: "s",
      unitBytes: "B",
      unitKb: "KB",
      unitMb: "MB",
      sandboxUnavailable:
        "Playback is off: no separate origin is configured for the player. A tag executes someone else's JavaScript, so we only run it in an isolated origin — otherwise the creative would reach this page and your session. The report above was built on the server and still stands.",
      sdkBlocked:
        "The Google IMA SDK was blocked by the browser — ad blockers and privacy extensions do this. Only playback is affected: the report above was built on the server and still stands. Allow the address for this site and start playback again:",
      degradedNotice:
        "The analysis is incomplete: some rules threw and did not run. No finding from them does not mean there is no violation.",
    },
  },
};

export const dictionaries: Record<Locale, Dict> = { ru, en };
export type { Dict };

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
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
