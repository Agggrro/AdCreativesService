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
    copyUrl: "Копировать URL",
    urlCopied: "URL скопирован",
    email: "Email",
    password: "Пароль",
    working: "Секунду…",
  },
  nav: {
    catalog: "Каталог",
    myCreatives: "Мои креативы",
    access: "Доступ",
    accounts: "Аккаунты",
    tools: "Инструменты",
    language: "Язык интерфейса",
    menu: "Меню",
  },
  meta: {
    title: "CreoSmith — интерактивные креативы и VAST-теги",
    description:
      "Соберите интерактивный креатив без разработчика и заберите динамический VAST-тег для любого DSP. SIMID 1.1 и VPAID 2.0.",
  },
  landing: {
    eyebrow: "Для медиабайеров и агентств",
    title: "Реклама, с которой действительно взаимодействуют",
    subtitle:
      "Выберите шаблон, настройте под кампанию и заберите динамический VAST-тег. SIMID 1.1 и VPAID 2.0 — вставляется в любой DSP без разработчика.",
    ctaStart: "Создать аккаунт",
    ctaDashboard: "Перейти в кабинет",
    ctaTemplates: "Смотреть шаблоны",
    heroNote: "Закрытый бета-тест · правка креатива не требует перевыпуска тега",

    howEyebrow: "Как это работает",
    howTitle: "От шаблона до тега в DSP — четыре шага",
    howLead:
      "От первого шага до готового тега — ничего, кроме браузера.",
    step1Title: "Выберите шаблон",
    step1Body:
      "Семь механик: шоппинг, скретч, до/после, квиз, возрастной гейт, выбор с сообщением и дуэль.",
    step2Title: "Настройте под кампанию",
    step2Body:
      "Медиафайлы, ссылка перехода, тексты кнопок. Превью обновляется сразу.",
    step3Title: "Заберите VAST-тег",
    step3Body:
      "Один динамический URL. Формат отдачи выбираете вы — SIMID или VPAID.",
    step4Title: "Вставьте в DSP",
    step4Body:
      "Тег отдаёт интерактив, пока у аккаунта есть доступ. Дальше — обычная закупка.",
    tagLabel: "Ваш тег",

    templatesEyebrow: "Шаблоны",
    templatesTitle: "Механики, готовые к запуску",
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

    toolsEyebrow: "Бесплатно",
    toolsTitle: "Инструменты для VAST-тегов",

    finalTitle: "Соберите первый креатив сегодня",
    finalBody: "Закрытый бета-тест: участникам открыты все шаблоны.",
    ctaCheckTag: "Проверить свой тег",
  },
  beta: {
    strip: "Закрытый бета-тест — доступ выдаётся вручную.",
    stripLink: "Написать в Telegram",
  },
  access: {
    title: "Доступ",
    subtitle:
      "Закрытый бета-тест: отдачу интерактива включает участникам администратор. Условия обсуждаем лично.",
    granted: "Доступ выдан",
    notGranted: "Доступа нет",
    grantedOn: "с",
    body: "Напишите в Telegram — договоримся об условиях и включим доступ на этот аккаунт.",
    telegram: "Написать в Telegram",
    accountLabel: "Аккаунт",
  },
  admin: {
    title: "Аккаунты",
    subtitle:
      "Все зарегистрированные аккаунты. Метка участника закрытого бета-теста открывает отдачу интерактива по всем шаблонам.",
    email: "Email",
    registered: "Регистрация",
    lastSignIn: "Последний вход",
    access: "Доступ",
    beta: "ЗБТ",
    subscription: "подписка",
    grant: "Выдать доступ",
    revoke: "Отозвать",
    revokeConfirmTitle: "Отозвать доступ?",
    revokeConfirmBody:
      "Теги этого аккаунта перестанут отдавать интерактив в течение двух минут. Повторная выдача вернёт доступ, но не показы, потерянные за это время.",
    empty: "Зарегистрированных аккаунтов пока нет.",
    propagation: "Изменение доходит до тега в течение двух минут.",
    errorGrant: "Не удалось выдать доступ — строка не записана. Попробуйте ещё раз.",
    errorRevoke: "Не удалось отозвать доступ — строка не изменена. Попробуйте ещё раз.",
    errorPublish:
      "Строка записана, но снапшот отдачи не опубликован. Публикация повторится в течение десяти минут; до этого тег не отдаётся.",
    errorList: "Не удалось получить список аккаунтов.",
  },
  footer: {
    tagline:
      "Интерактивные креативы и динамические VAST-теги.",
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
    // By code (lib/auth-errors.ts): the page never prints what the URL says.
    errors: {
      invalid_credentials: "Неверный email или пароль. Проверьте их и попробуйте ещё раз.",
      email_not_confirmed: "Email ещё не подтверждён — откройте ссылку из письма, затем войдите.",
      rate_limited: "Слишком много попыток. Подождите несколько минут и попробуйте ещё раз.",
      user_exists: "Аккаунт с этим email уже есть — войдите.",
      weak_password: "Пароль слишком простой — придумайте длиннее и сложнее.",
      email_invalid: "Этот адрес не подходит для регистрации — проверьте его или укажите другой.",
      email_not_authorized:
        "Не удалось отправить письмо на этот адрес. Сбой на нашей стороне — напишите нам в Telegram.",
      signup_disabled: "Регистрация сейчас закрыта — напишите нам в Telegram.",
      signin_failed: "Не удалось войти. Попробуйте ещё раз; если повторится — напишите нам в Telegram.",
      signup_failed: "Не удалось создать аккаунт. Попробуйте ещё раз; если повторится — напишите нам в Telegram.",
    },
  },
  dashboard: {
    templates: "Шаблоны",
    configure: "Настроить креатив",
    noTemplates: "Пока ни один шаблон не опубликован.",
    creatives: "Креативы",
    creativesSubtitle:
      "Ваши собранные креативы, их VAST-теги и статистика показов.",
    noCreatives: "Креативов пока нет.",
    createFirst: "Соберите первый в каталоге",
    browseCatalog: "Открыть каталог",
    serving: "Отдаётся",
    notServing: "Не отдаётся",
    notServingHint: "Нужен доступ участника бета-теста",
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
    viewableNoVersion: "В этой версии VAST видимость не передаётся — она появилась в 4.0",
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
    // to be told before pressing an irreversible button. Conversions are named
    // since ADR-0023: they cascade with the creative too, and they are the
    // numbers a buyer is least prepared to lose.
    deleteConfirmBody:
      "Вместе с креативом безвозвратно удаляются вся его статистика — показы, клики и конверсии — и загруженные файлы. Тег перестанет отдавать интерактивный payload в течение минуты.",
    deleteConfirmAction: "Удалить",
    // "Дублировать", not "Копировать": the same row already has "Копировать
    // тег", and two "Копировать" buttons a column apart do different things.
    duplicate: "Дублировать",
    duplicateTitle: "Создать новый креатив с теми же настройками, без статистики",
    template: "Шаблон",
    description: "Описание",
    format: "Формат",
    status: "Статус",
    // VAST video creatives (ADR-0035).
    newVideo: "Создать VAST-видео",
    videoKind: "VAST-видео",
    progress: "Досмотры",
    progressSteps: {
      start: "старт",
      q25: "25%",
      q50: "50%",
      q75: "75%",
      complete: "до конца",
    },
    vtr: "VTR",
    vtrOfImpressions: "досмотрели до конца, от показов",
    viewablePlayerReported: "Сообщает плеер, если умеет мерить видимость",
    checkInValidator: "Проверить в валидаторе",
  },
  // A creative's conversion report (ADR-0023), on its detail page.
  conversions: {
    heading: "Конверсии · 30 дней",
    setUp: "Настроить постбек",
    clicks: "Отслеженные клики",
    clicksHint: "Переходы через трекинг-ссылку, каждому выдан `click_id`",
    conversions: "Конверсии",
    approved: "одобрено",
    pending: "в ожидании",
    rejected: "отклонено",
    rejectedNotCounted: "отклонено — не в счёт",
    revenue: "Выручка",
    revenueHint: "По одобренным конверсиям",
    cr: "CR",
    crOfClicks: "от кликов",
    crColumn: "CR от кликов",
    crOfAllClicksColumn: "CR от всех кликов",
    epc: "EPC",
    epcHint: "Выручка на клик",
    byExit: "По выходам",
    exit: "Выход",
    mainExit: "Основная ссылка",
    // A VAST video creative's banners share one destination (ADR-0035).
    companionExit: "Ссылка с баннеров",
    byGoal: "По целям",
    goal: "Цель",
    noGoal: "Без цели",
    byGoalNote:
      "Цель — то, что партнёрка передала в `goal`. CR каждой цели считается от всех отслеженных кликов: клик не знает, до какой цели дойдёт. В сводке выше цели сложены вместе.",
    byDay: "По дням, UTC",
    byDayNote:
      "Клики — по дню клика, конверсии — по дню первого постбека. Когда партнёрка позже меняет статус, конверсия остаётся в своём дне.",
    day: "Дата",
    missingMacro:
      "В этих ссылках перехода нет {click_id}, поэтому партнёрка не сможет вернуть по ним конверсии. Добавьте его в настройках креатива.",
    unavailable:
      "Статистика конверсий сейчас недоступна. Обновите страницу через минуту.",
  },
  // VAST <Error> beacons on a creative's detail page (ADR-0033).
  vastErrors: {
    heading: "Ошибки VAST",
    total: "Ошибки",
    // Why there is no rate: an error often comes with no impression at all,
    // and we count no ad requests to divide by (§6).
    totalHint:
      "Сообщают плееры через `<Error>`, за всё время. Ошибка часто случается до показа, поэтому ошибки не делятся на показы.",
    code: "Код",
    description: "Что произошло",
    count: "Ошибки",
    share: "Доля от ошибок",
    none: "Плееры не сообщали об ошибках.",
    noCode: "Код не передан или не распознан",
    // Shown for a code the IAB table does not define — a vendor's own, say.
    unknownCode: "Код вне спецификации `VAST 4.2`",
    unavailable:
      "Статистика ошибок сейчас недоступна. Обновите страницу через минуту.",
  },
  // The account's postback settings page (ADR-0023).
  postback: {
    title: "Постбек",
    subtitle:
      "Партнёрка сообщает о конверсии по этой ссылке, а CreoSmith засчитывает её креативу, с которого пришёл клик.",
    howHeading: "Как подключить",
    step1:
      "В настройках креатива поставьте {click_id} в ссылку оффера — в параметр, который партнёрка возвращает в постбеке: `sub1`, `aff_sub`, `subid`.",
    step2:
      "Вставьте URL ниже в настройки постбека партнёрки. Замените каждое {…} после знака = на её макрос, а параметры, для которых у неё макроса нет, удалите.",
    step3:
      "Конверсии появятся на странице креатива, а каждый пришедший постбек — в журнале ниже.",
    urlHeading: "Postback URL",
    keyWarning:
      "Ключ в ссылке работает как пароль: с ним кто угодно может отправлять конверсии в ваш аккаунт. Не публикуйте его.",
    keyUnavailable:
      "Не удалось получить ключ постбека. Обновите страницу через минуту.",
    rotate: "Сменить ключ",
    rotateTitle: "Сменить ключ постбека?",
    rotateBody:
      "Старый ключ перестанет работать сразу. Партнёрки со старой ссылкой начнут получать ошибку, пока вы не обновите в них URL.",
    rotateConfirm: "Сменить",
    rotated: "Ключ сменён. Обновите ссылку во всех партнёрках.",
    rotateFailed: "Не удалось сменить ключ. Попробуйте ещё раз.",
    paramsHeading: "Параметры",
    param: "Параметр",
    meaning: "Что передавать",
    params: {
      key: "Ваш ключ, уже подставлен в ссылку.",
      click_id:
        "Значение нашего {click_id}, которое партнёрка получила в ссылке оффера. Обязательный.",
      status:
        "Статус конверсии. Если его нет, конверсия считается одобренной.",
      payout: "Выплата за конверсию, например `12.5`.",
      currency: "Трёхбуквенный код валюты. Если его нет — `USD`.",
      txid: "ID транзакции в партнёрке. Нужен, если по одной цели у клика бывает несколько конверсий — например, повторные депозиты. Повторный постбек с теми же `goal` и `txid` обновляет статус, а не создаёт дубль.",
      goal: "Цель конверсии — например, регистрация или депозит, до 64 символов. Без неё конверсия записывается без цели. У клика может быть по конверсии на каждую цель, и отчёт креатива показывает их по целям.",
    },
    statusesHeading: "Статусы",
    statusCol: "Статус",
    acceptedCol: "Какие значения принимаем",
    statuses: {
      approved: "Одобрена",
      pending: "В ожидании",
      rejected: "Отклонена",
    },
    logHeading: "Последние постбеки",
    logRetention: "Хранятся 7 дней",
    logEmpty:
      "Постбеков пока не было. Первый появится здесь, даже если придёт с ошибкой.",
    logUnavailable: "Журнал сейчас недоступен. Обновите страницу через минуту.",
    time: "Время, UTC",
    result: "Результат",
    ok: "OK",
    failed: "Ошибка",
    results: {
      created: "Конверсия засчитана",
      updated: "Статус обновлён",
      unchanged:
        "Без изменений: это уже записано, или поздний `pending` пришёл после итогового статуса",
      unknown_click:
        "Клик не найден — проверьте, что в `click_id` партнёрка возвращает значение нашего {click_id}",
      expired_click: "Клик старше 30 дней, конверсию по нему не засчитываем",
      missing_click_id:
        "В постбеке нет `click_id` — добавьте его в URL постбека в партнёрке",
      bad_click_id:
        "`click_id` не похож на наш — похоже, партнёрка прислала макрос как есть. Проверьте его название в её настройках",
      unexpanded_macro:
        "Партнёрка прислала макрос как есть — замените его в URL постбека на её макрос или удалите этот параметр",
      bad_status: "Неизвестный статус — используйте значение из таблицы статусов",
      bad_payout: "Не удалось прочитать `payout` — нужно число, например `12.5`",
      bad_currency: "`currency` — не трёхбуквенный код. Передайте, например, `USD`",
      bad_txid: "`txid` длиннее 128 символов — укоротите его или не передавайте",
      bad_goal: "`goal` длиннее 64 символов — передавайте ID цели вместо названия или уберите параметр",
      unknown: "Неизвестный результат",
    },
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
    errDuplicateFailed:
      "Не удалось дублировать креатив. Попробуйте ещё раз; если повторится — напишите нам.",
    // Under every click-destination field (ADR-0023). Macros stay literal —
    // they are what the user types, in either language.
    clickMacroHint:
      "Макросы: {click_id} — для постбека партнёрки, {creative_id}, {outcome}.",
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
      pickChoice: "Выбор",
      pickMessage: "Сообщение",
      pickSound: "Звук",
      pickClick: "Переход по клику",
      duelScenario: "Сценарий роликов",
      duelRound: "Раунд",
      duelFinish: "Победитель",
      duelClick: "Переход по клику",
      sbFlow: "Структура",
      sbStep1: "Шаг 1",
      sbStep1Options: "Варианты шага 1",
      sbStep2: "Шаг 2",
      sbStep2Options: "Варианты шага 2",
      sbStep3: "Шаг 3",
      sbStep3Options: "Варианты шага 3",
      sbFinish: "Финальный экран",
      sbClick: "Переход по клику",
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
      "Откройте любую и попробуйте руками.",
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
      "VAST-тег линейного видео под нужную версию — с вашими пикселями, баннерами и AdChoices. Тег динамический и хранится в «Моих креативах».",
    validatorName: "Валидатор VAST",
    playerFrame: "Плеер VAST",
    validatorMetaTitle: "Валидатор VAST — проверить и проиграть тег",
    validatorMetaDescription:
      "Вставьте URL или XML VAST-тега. Проверяем по спецификации IAB, проходим цепочку враппера, проигрываем в Google IMA и показываем каждую ошибку с исправлением. VPAID, SIMID и OMID включены. Бесплатно, без аккаунта.",
    generatorMetaTitle: "Генератор VAST-тегов — линейное видео, VAST 2.0–4.3",
    generatorMetaDescription:
      "VAST-тег линейного видео под версию 2.0–4.3: загрузите ролик или дайте ссылку, добавьте пиксели DSP, баннеры и AdChoices. XML проверяется нашим валидатором и проигрывается в Google IMA. Сохранить тег — после бесплатной регистрации.",
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
  // The VAST generator (ADR-0035): a plain linear video creative with trackers.
  // Machine values — VAST element and event names, macros, versions — stay
  // English inside these sentences, the way a DSP writes them (§10).
  vastGen: {
    title: "Генератор VAST",
    subtitle:
      "VAST-тег линейного видео с трекингом, под нужную версию. Тег динамический: его можно менять после размещения, и он отдаёт рекламу, пока у вас есть доступ.",
    editTitle: "Изменить VAST-видео",
    versionHeading: "Версия VAST",
    versionHelp:
      "Определяет, какие параметры есть в теге. Берите ту, что принимает ваша DSP или SSP; не уверены — 4.2.",
    laterVersions: "В более новых версиях",
    sinceVersion: "с {version}",
    excludedNotice:
      "Не войдёт в тег `VAST {version}`: {list}. Значения сохранятся в форме, если вернуть версию.",
    basicsHeading: "Основное",
    name: "Название креатива",
    nameHelp: "Видно только вам, в «Моих креативах». Пусто — возьмём название в теге.",
    adTitle: "Название в теге",
    adTitleHelp: "`AdTitle` — его видят DSP и плеер.",
    description: "Описание",
    advertiser: "Рекламодатель",
    videoHeading: "Видео",
    videoLabel: "Ролик",
    videoHelp: "MP4 (H.264) или WebM, до 25 МБ. Хостим как есть, без перекодирования.",
    imageHelp: "PNG, JPEG или GIF, до 25 МБ.",
    upload: "Загрузить",
    link: "Ссылка",
    chooseFile: "Выбрать файл",
    uploading: "Загружается…",
    reading: "Читаем файл…",
    replace: "Заменить",
    linkPlaceholder: "https://cdn.example.com/spot.mp4",
    linkType: "Тип файла",
    apply: "Применить",
    signInToUpload: "Войдите, чтобы загрузить файл",
    linkedFile: "Файл по ссылке",
    uploadedFile: "Загруженный файл",
    imageLinkPlaceholder: "https://cdn.example.com/banner.png",
    errVideoType: "Нужен MP4 или WebM.",
    errImageType: "Нужен PNG, JPEG или GIF.",
    errTooLarge: "Файл больше 25 МБ.",
    errUploadFailed: "Не удалось загрузить файл. Попробуйте ещё раз.",
    errProbe: "Не удалось прочитать видео: проверьте, что ссылка открывается и ведёт на файл ролика.",
    errProbeImage: "Не удалось открыть картинку по ссылке.",
    errProbeFile: "Не удалось прочитать файл как видео: нужен MP4 (H.264) или WebM.",
    errProbeImageFile: "Не удалось открыть файл как картинку.",
    kbps: "кбит/с",
    megabytes: "МБ",
    clickHeading: "Переход по клику",
    clickThrough: "Ссылка перехода",
    clickThroughHelp:
      "Клик пройдёт через наш редирект: он посчитается и получит click id. Подставьте {click_id} в ссылку — сеть вернёт его в постбэке.",
    skipHeading: "Пропуск",
    skipOff: "Нельзя",
    skipOn: "Можно",
    skipAfter: "Кнопка пропуска через, сек",
    trackingHeading: "Трекинг",
    ourTrackers: "Наши трекеры",
    ourTrackersHelp:
      "Всегда в теге и считаются в вашей статистике: показы, клики, ошибки по кодам и досмотры.",
    pixels: "Ваши пиксели",
    pixelsHelp:
      "Пиксели DSP, верификатора или своей системы. Только https; из макросов — те, что подставляет плеер, например `[CACHEBUSTING]`.",
    pixelEvent: "Событие",
    pixelUrl: "URL пикселя",
    addPixel: "Добавить пиксель",
    removePixel: "Удалить",
    noPixels: "Своих пикселей нет — в теге только наши.",
    pixelNotInTag: "При текущих настройках в тег не входит.",
    pixelTypes: {
      impression: "Показ",
      error: "Ошибка",
      click: "Клик",
      viewable: "Видимый показ",
      notViewable: "Невидимый показ",
      viewUndetermined: "Видимость не определена",
      companionView: "Показ баннера",
      companionClick: "Клик по баннеру",
      iconView: "Показ AdChoices",
      iconClick: "Клик по AdChoices",
    },
    companionsHeading: "Companion-баннеры",
    companionsHelp: "Картинка рядом с плеером. До трёх размеров — площадка покажет подходящий.",
    companion: "Баннер {n}",
    companionImage: "Картинка",
    width: "Ширина, px",
    height: "Высота, px",
    companionAlt: "Альтернативный текст",
    addCompanion: "Добавить баннер",
    removeCompanion: "Убрать баннер",
    companionClickThrough: "Ссылка перехода с баннеров",
    companionClickThroughHelp: "Одна на все баннеры и тоже через наш редирект.",
    iconHeading: "AdChoices",
    iconOff: "Без иконки",
    iconOn: "С иконкой",
    iconProgram: "Программа",
    iconImage: "Иконка",
    iconCorner: "Угол",
    corners: {
      topLeft: "Сверху слева",
      topRight: "Сверху справа",
      bottomLeft: "Снизу слева",
      bottomRight: "Снизу справа",
    },
    iconOffset: "Появляется на, сек",
    iconDuration: "Показывается, сек",
    iconDurationHelp: "Пусто — до конца ролика.",
    iconClickThrough: "Ссылка с иконки",
    iconClickThroughHelp:
      "Обычно страница о рекламе и данных. Открывается напрямую, не через наш редирект, и кликом не считается.",
    omidHeading: "Верификация OMID",
    omidOff: "Без верификации",
    omidOn: "С верификацией",
    omidVendor: "Вендор",
    omidVendorHelp: "Ключ вендора из его инструкции, например `company.com-omid`.",
    omidScript: "Скрипт вендора",
    omidParameters: "Параметры",
    omidParametersHelp: "Строка от вендора, передаётся как есть.",
    uaidHeading: "UniversalAdId",
    uaidAuto: "Наш",
    uaidCustom: "Свой",
    uaidAutoHelp: "По умолчанию — реестр `creosmith` и id креатива.",
    uaidRegistry: "Реестр",
    uaidValue: "Идентификатор",
    xmlHeading: "XML тега",
    xmlCaption:
      "Предпросмотр: трекинг-ссылки здесь — заглушки. Настоящие, подписанные, будут в теге после сохранения.",
    xmlIncomplete: "XML появится, когда будут название в теге и видео.",
    xmlBlocked: "XML появится, когда в форме не останется ошибок — кнопка под формой их отметит.",
    wellIdle:
      "Здесь проиграется тег. Пиксели при проверке не отправляются — ни наши, ни ваши.",
    wellNeedsMedia: "Добавьте видео, чтобы проиграть тег.",
    play: "Проверить и проиграть",
    playing: "Проверяем",
    create: "Создать креатив",
    signInAndCreate: "Войти и создать",
    signInNote:
      "Креатив сохранится в «Моих креативах», а тег будет отдавать рекламу, пока у вас есть доступ участника бета-теста. Черновик останется в этом браузере.",
    save: "Сохранить изменения",
    saving: "Сохраняем",
    cancel: "Отмена",
    draftRestored: "Восстановили незаконченный черновик.",
    startOver: "Начать заново",
    fixErrors: "Исправьте поля, отмеченные ниже.",
    issues: {
      bad_shape: "Значение в неверном формате.",
      required: "Обязательное поле.",
      too_long: "Слишком длинно.",
      too_many: "Слишком много пунктов.",
      too_large: "Настройки слишком большие — уберите часть пикселей или текста.",
      bad_version: "Выберите версию VAST.",
      bad_url: "Некорректный адрес: без пробелов и угловых скобок.",
      not_https: "Нужен https.",
      not_http: "Нужна ссылка http(s).",
      script_scheme: "Такая ссылка запускает скрипт — её нельзя.",
      unknown_macro: "Плеер не подставит этот макрос в такой пиксель. Оставьте стандартные VAST-макросы.",
      macro_in_host: "Макрос не может быть частью адреса сервера: плеер подставит значение, и пиксель уйдёт на адрес, который мы не проверяли.",
      destination_macro: "Переход идёт через наш редирект, и `[МАКРОСЫ]` сюда никто не подставит. Используйте {click_id}.",
      credentials_in_url: "В адресе логин или пароль — браузер такой запрос не отправит.",
      placeholder_value: "Это заглушка, а не идентификатор: укажите id из реестра или выберите «Наш».",
      own_host: "Это наш адрес — здесь его указать нельзя.",
      private_host: "Адрес из локальной сети у зрителя не откроется.",
      error_macro_missing: "Добавьте макрос `[ERRORCODE]` — без него не узнать причину ошибки.",
      error_macro_unavailable: "В этой версии VAST нет макроса `[ERRORCODE]`.",
      not_own_media: "Файла нет среди ваших загрузок — загрузите его заново.",
      bad_mime: "Неподдерживаемый тип файла.",
      mime_mismatch: "Тип не совпадает с расширением файла в ссылке.",
      out_of_range: "Значение вне допустимого диапазона.",
      bad_event: "Этого события нет в выбранной версии VAST.",
      duplicate: "Такой пиксель уже есть.",
    },
    errUnauthorized: "Сессия истекла — войдите снова.",
    errSaveFailed: "Не удалось сохранить. Попробуйте ещё раз.",
    errSelfCheck: "Тег не прошёл нашу же проверку:",
    selfCheckIncomplete: "проверка не завершилась. Попробуйте сохранить ещё раз.",
    errMediaMissing: "Один из загруженных файлов не найден — загрузите его заново.",
    errNotFound: "Креатив не найден — возможно, его удалили.",
    errStoredConfig:
      "Сохранённые настройки этого креатива не читаются, поэтому его тег сейчас отдаёт пустой VAST. Создайте креатив заново в генераторе.",
    editDroppedNotice:
      "Часть сохранённых настроек больше не проходит наши проверки и в тег не входит: {n}. Если сохранить форму, эта часть удалится.",
    runStale: "Тег изменился после проверки — проверьте ещё раз.",
    backToCreative: "К креативу",
    features: {
      advertiser: "рекламодатель",
      skip: "пропуск",
      icon: "AdChoices",
      universalAdId: "свой UniversalAdId",
      viewableImpression: "пиксели видимости",
      companionClickTracking: "клики по баннерам",
      omid: "OMID",
      thirdPartyError: "свои пиксели ошибок",
      errorMacro: "[ERRORCODE]",
      adServingId: "AdServingId",
      events: "события плеера",
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
    copyUrl: "Copy URL",
    urlCopied: "URL copied",
    email: "Email",
    password: "Password",
    working: "One moment…",
  },
  nav: {
    catalog: "Catalog",
    myCreatives: "My creatives",
    access: "Access",
    accounts: "Accounts",
    tools: "Tools",
    language: "Interface language",
    menu: "Menu",
  },
  meta: {
    title: "CreoSmith — interactive ad creatives and VAST tags",
    description:
      "Build an interactive ad creative without a developer and take a dynamic VAST tag for any DSP. SIMID 1.1 and VPAID 2.0.",
  },
  landing: {
    eyebrow: "For media buyers and agencies",
    title: "Ads your viewer actually touches",
    subtitle:
      "Pick a template, tune it to the campaign, take the dynamic VAST tag. SIMID 1.1 and VPAID 2.0 — it pastes into any DSP, with no developer.",
    ctaStart: "Create an account",
    ctaDashboard: "Go to dashboard",
    ctaTemplates: "See the templates",
    heroNote: "Closed beta · editing a creative never reissues the tag",

    howEyebrow: "How it works",
    howTitle: "Template to DSP tag in four steps",
    howLead:
      "From the first step to a working tag — nothing but a browser.",
    step1Title: "Pick a template",
    step1Body:
      "Seven mechanics: shoppable, scratch, before/after, quiz, an age gate, pick-and-message, and a duel.",
    step2Title: "Tune it to the campaign",
    step2Body:
      "Media, click-through, button copy. The preview updates as you type.",
    step3Title: "Take the VAST tag",
    step3Body:
      "One dynamic URL. You choose the delivery format — SIMID or VPAID.",
    step4Title: "Paste it into your DSP",
    step4Body:
      "The tag serves the interactive payload while the account has access. The rest is ordinary buying.",
    tagLabel: "Your tag",

    templatesEyebrow: "Templates",
    templatesTitle: "Mechanics ready to run",
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

    toolsEyebrow: "Free",
    toolsTitle: "Tools for VAST tags",

    finalTitle: "Build your first creative today",
    finalBody: "Closed beta: every template is open to participants.",
    ctaCheckTag: "Check your own tag",
  },
  beta: {
    strip: "Closed beta — access is granted by hand.",
    stripLink: "Message on Telegram",
  },
  access: {
    title: "Access",
    subtitle:
      "Closed beta: the administrator switches interactive delivery on for participants. Terms are agreed in person.",
    granted: "Access granted",
    notGranted: "No access",
    grantedOn: "since",
    body: "Message on Telegram — we agree the terms and switch access on for this account.",
    telegram: "Message on Telegram",
    accountLabel: "Account",
  },
  admin: {
    title: "Accounts",
    subtitle:
      "Every registered account. The closed-beta participant mark opens interactive delivery on every template.",
    email: "Email",
    registered: "Registered",
    lastSignIn: "Last sign-in",
    access: "Access",
    beta: "beta",
    subscription: "subscription",
    grant: "Grant access",
    revoke: "Revoke",
    revokeConfirmTitle: "Revoke access?",
    revokeConfirmBody:
      "This account's tags stop serving the interactive payload within two minutes. Granting again restores access, not the impressions lost meanwhile.",
    empty: "No registered accounts yet.",
    propagation: "A change reaches the tag within two minutes.",
    errorGrant: "Could not grant access — nothing was written. Try again.",
    errorRevoke: "Could not revoke access — nothing was changed. Try again.",
    errorPublish:
      "The row was written but the serving snapshot was not published. Publishing is retried within ten minutes; until then the tag does not serve.",
    errorList: "Could not load the account list.",
  },
  footer: {
    tagline:
      "Interactive ad creatives and dynamic VAST tags.",
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
    errors: {
      invalid_credentials: "Wrong email or password. Check them and try again.",
      email_not_confirmed: "Your email is not confirmed yet — open the link we sent, then sign in.",
      rate_limited: "Too many attempts. Wait a few minutes and try again.",
      user_exists: "An account with this email already exists — sign in instead.",
      weak_password: "The password is too weak — choose a longer, stronger one.",
      email_invalid: "This address cannot be used to sign up — check it for a typo or use another.",
      email_not_authorized:
        "We could not send an email to this address. The fault is on our side — message us on Telegram.",
      signup_disabled: "Sign-up is closed right now — message us on Telegram.",
      signin_failed: "Could not sign in. Try again; if it keeps failing, message us on Telegram.",
      signup_failed: "Could not create the account. Try again; if it keeps failing, message us on Telegram.",
    },
  },
  dashboard: {
    templates: "Templates",
    configure: "Configure creative",
    noTemplates: "No templates published yet.",
    creatives: "Creatives",
    creativesSubtitle:
      "The creatives you have built, their VAST tags, and their delivery numbers.",
    noCreatives: "No creatives yet.",
    createFirst: "Build the first one from the catalog",
    browseCatalog: "Open the catalog",
    serving: "Serving",
    notServing: "Not serving",
    notServingHint: "Needs closed-beta access",
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
    viewableNoVersion: "This VAST version carries no viewability — it arrived in 4.0",
    viewabilityHeading: "Viewability measurement",
    createCreative: "Create creative",
    edit: "Edit",
    saveChanges: "Save changes",
    vastTag: "VAST tag",
    deleteCreative: "Delete creative",
    deleteConfirmTitle: "Delete this creative?",
    deleteConfirmBody:
      "All of the creative's statistics — impressions, clicks and conversions — and its uploaded files are destroyed along with it, permanently. The tag stops serving the interactive payload within about a minute.",
    deleteConfirmAction: "Delete",
    duplicate: "Duplicate",
    duplicateTitle: "Create a new creative with the same settings and no statistics",
    template: "Template",
    description: "Description",
    format: "Format",
    status: "Status",
    newVideo: "Create VAST video",
    videoKind: "VAST video",
    progress: "Video progress",
    progressSteps: {
      start: "start",
      q25: "25%",
      q50: "50%",
      q75: "75%",
      complete: "complete",
    },
    vtr: "VTR",
    vtrOfImpressions: "completed, of impressions",
    viewablePlayerReported: "Reported by the player, when it measures viewability",
    checkInValidator: "Check in the validator",
  },
  conversions: {
    heading: "Conversions · 30 days",
    setUp: "Set up postback",
    clicks: "Tracked clicks",
    clicksHint: "Through the tracking link, each given a `click_id`",
    conversions: "Conversions",
    approved: "approved",
    pending: "pending",
    rejected: "rejected",
    rejectedNotCounted: "rejected — not counted",
    revenue: "Revenue",
    revenueHint: "From approved conversions",
    cr: "CR",
    crOfClicks: "of clicks",
    crColumn: "CR of clicks",
    crOfAllClicksColumn: "CR of all clicks",
    epc: "EPC",
    epcHint: "Revenue per click",
    byExit: "By exit",
    exit: "Exit",
    mainExit: "Main link",
    companionExit: "Banner link",
    byGoal: "By goal",
    goal: "Goal",
    noGoal: "No goal",
    byGoalNote:
      "The goal is what your network sent in `goal`. Each goal's CR is of all tracked clicks — a click doesn't know which goal it will reach. The summary above adds the goals together.",
    byDay: "By day, UTC",
    byDayNote:
      "Clicks by the day of the click, conversions by the day of their first postback. A later status change keeps a conversion on its day.",
    day: "Date",
    missingMacro:
      "These click-through links have no {click_id}, so your network cannot report conversions back for them. Add it in the creative's settings.",
    unavailable:
      "Conversion numbers are unavailable right now. Refresh in a minute.",
  },
  vastErrors: {
    heading: "VAST errors",
    total: "Errors",
    totalHint:
      "Reported by players through `<Error>`, all time. An error often happens before any impression, so errors are not divided by impressions.",
    code: "Code",
    description: "What happened",
    count: "Errors",
    share: "Share of errors",
    none: "No player has reported an error.",
    noCode: "No code, or one we could not read",
    unknownCode: "Code outside the `VAST 4.2` spec",
    unavailable: "Error numbers are unavailable right now. Refresh in a minute.",
  },
  postback: {
    title: "Postback",
    subtitle:
      "Your network reports each conversion to this URL, and CreoSmith credits it to the creative the click came from.",
    howHeading: "How to connect",
    step1:
      "In the creative's settings, put {click_id} into the offer link — in the parameter your network returns in its postback: `sub1`, `aff_sub`, `subid`.",
    step2:
      "Paste the URL below into your network's postback settings. Replace each {…} after an = with that network's macro, and remove the parameters it has no macro for.",
    step3:
      "Conversions appear on the creative's page, and every postback that arrives shows up in the log below.",
    urlHeading: "Postback URL",
    keyWarning:
      "The key in this URL works like a password: anyone holding it can post conversions to your account. Keep it private.",
    keyUnavailable:
      "Couldn't load your postback key. Refresh the page in a minute.",
    rotate: "Rotate key",
    rotateTitle: "Rotate the postback key?",
    rotateBody:
      "The old key stops working immediately. Every network still using the old URL gets an error until you update it there.",
    rotateConfirm: "Rotate",
    rotated: "Key rotated. Update the URL in every network.",
    rotateFailed: "Couldn't rotate the key. Try again.",
    paramsHeading: "Parameters",
    param: "Parameter",
    meaning: "What to send",
    params: {
      key: "Your key, already filled in.",
      click_id:
        "The value of our {click_id} your network received in the offer link. Required.",
      status:
        "Conversion status. Without it, the conversion counts as approved.",
      payout: "Payout for the conversion, e.g. `12.5`.",
      currency: "Three-letter currency code. `USD` when absent.",
      txid: "The network's transaction id. Needed when one click can convert more than once for the same goal — repeat deposits, say. A repeat postback with the same `goal` and `txid` updates the status instead of adding a duplicate.",
      goal: "The conversion goal — registration or deposit, say — up to 64 characters. Without it, the conversion is recorded with no goal. A click can carry a conversion per goal, and the creative's report shows them by goal.",
    },
    statusesHeading: "Statuses",
    statusCol: "Status",
    acceptedCol: "Accepted values",
    statuses: {
      approved: "Approved",
      pending: "Pending",
      rejected: "Rejected",
    },
    logHeading: "Recent postbacks",
    logRetention: "Kept for 7 days",
    logEmpty:
      "No postbacks yet. The first one shows up here, even if it fails.",
    logUnavailable: "The log is unavailable right now. Refresh in a minute.",
    time: "Time, UTC",
    result: "Result",
    ok: "OK",
    failed: "Failed",
    results: {
      created: "Conversion recorded",
      updated: "Status updated",
      unchanged:
        "No change: already recorded, or a late `pending` arrived after a final status",
      unknown_click:
        "Click not found — check that `click_id` carries the value of our {click_id}",
      expired_click: "Click older than 30 days, so the conversion wasn't recorded",
      missing_click_id:
        "The postback has no `click_id` — add it to the postback URL at your network",
      bad_click_id:
        "`click_id` doesn't look like ours — the network may have sent its macro unexpanded. Check the macro's name in its settings",
      unexpanded_macro:
        "The network sent a macro unexpanded — replace it in the postback URL with that network's macro, or remove the parameter",
      bad_status: "Unknown status — use a value from the statuses table",
      bad_payout: "Couldn't read `payout` — it needs a number, e.g. `12.5`",
      bad_currency: "`currency` isn't a three-letter code. Send e.g. `USD`",
      bad_txid: "`txid` is longer than 128 characters — shorten it or leave it out",
      bad_goal: "`goal` is longer than 64 characters — send the goal's id instead of its name, or leave the parameter out",
      unknown: "Unknown result",
    },
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
    errDuplicateFailed:
      "Could not duplicate the creative. Try again; if it keeps failing, contact us.",
    clickMacroHint:
      "Macros: {click_id} for your network's postback, {creative_id}, {outcome}.",
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
      pickChoice: "Choice",
      pickMessage: "Message",
      pickSound: "Sound",
      pickClick: "Click-through",
      duelScenario: "Clip scenario",
      duelRound: "Round",
      duelFinish: "Winner",
      duelClick: "Click-through",
      sbFlow: "Structure",
      sbStep1: "Step 1",
      sbStep1Options: "Step 1 options",
      sbStep2: "Step 2",
      sbStep2Options: "Step 2 options",
      sbStep3: "Step 3",
      sbStep3Options: "Step 3 options",
      sbFinish: "Final screen",
      sbClick: "Click-through",
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
      "Open any of them and try it by hand.",
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
      "A VAST tag for a linear video at the version you need — with your pixels, banners and AdChoices. The tag is dynamic and lives in My creatives.",
    validatorName: "VAST validator",
    playerFrame: "VAST player",
    validatorMetaTitle: "VAST validator — check and play a VAST tag",
    validatorMetaDescription:
      "Paste a VAST tag URL or XML. Checks it against the IAB specification, walks the wrapper chain, plays it in Google IMA, and reports every fault with a fix. VPAID, SIMID and OMID included. Free, no account.",
    generatorMetaTitle: "VAST tag generator — linear video, VAST 2.0–4.3",
    generatorMetaDescription:
      "A VAST tag for a linear video at version 2.0–4.3: upload a spot or link one, add DSP pixels, banners and AdChoices. The XML is checked by our validator and played in Google IMA. Saving the tag takes a free account.",
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
  vastGen: {
    title: "VAST generator",
    subtitle:
      "A VAST tag for a linear video with tracking, at the version you need. The tag is dynamic: you can change it after it is placed, and it serves while you have access.",
    editTitle: "Edit VAST video",
    versionHeading: "VAST version",
    versionHelp:
      "Decides which parameters the tag can carry. Pick the one your DSP or SSP accepts; if unsure, 4.2.",
    laterVersions: "In later versions",
    sinceVersion: "from {version}",
    excludedNotice:
      "Left out of the `VAST {version}` tag: {list}. The values stay in the form if you switch back.",
    basicsHeading: "Basics",
    name: "Creative name",
    nameHelp: "Only you see it, in My creatives. Empty: the title in the tag.",
    adTitle: "Title in the tag",
    adTitleHelp: "`AdTitle` — what DSPs and the player see.",
    description: "Description",
    advertiser: "Advertiser",
    videoHeading: "Video",
    videoLabel: "Spot",
    videoHelp: "MP4 (H.264) or WebM, up to 25 MB. Hosted as is, not re-encoded.",
    imageHelp: "PNG, JPEG or GIF, up to 25 MB.",
    upload: "Upload",
    link: "Link",
    chooseFile: "Choose file",
    uploading: "Uploading…",
    reading: "Reading the file…",
    replace: "Replace",
    linkPlaceholder: "https://cdn.example.com/spot.mp4",
    linkType: "File type",
    apply: "Apply",
    signInToUpload: "Sign in to upload a file",
    linkedFile: "Linked file",
    uploadedFile: "Uploaded file",
    imageLinkPlaceholder: "https://cdn.example.com/banner.png",
    errVideoType: "Use an MP4 or a WebM.",
    errImageType: "Use a PNG, JPEG or GIF.",
    errTooLarge: "The file is over 25 MB.",
    errUploadFailed: "The upload failed. Try again.",
    errProbe: "The video could not be read: check that the link opens and points at the video file.",
    errProbeImage: "The image at that link could not be opened.",
    errProbeFile: "The file could not be read as a video: use an MP4 (H.264) or a WebM.",
    errProbeImageFile: "The file could not be opened as an image.",
    kbps: "kbit/s",
    megabytes: "MB",
    clickHeading: "Click-through",
    clickThrough: "Destination URL",
    clickThroughHelp:
      "The click goes through our redirect, which counts it and gives it a click id. Put {click_id} in the URL and the network returns it in its postback.",
    skipHeading: "Skip",
    skipOff: "Not skippable",
    skipOn: "Skippable",
    skipAfter: "Skip button after, seconds",
    trackingHeading: "Tracking",
    ourTrackers: "Our trackers",
    ourTrackersHelp:
      "Always in the tag, and counted in your statistics: impressions, clicks, errors by code and video progress.",
    pixels: "Your pixels",
    pixelsHelp:
      "Pixels from a DSP, a verifier or your own system. https only; macros only the ones a player substitutes, such as `[CACHEBUSTING]`.",
    pixelEvent: "Event",
    pixelUrl: "Pixel URL",
    addPixel: "Add pixel",
    removePixel: "Remove",
    noPixels: "No pixels of your own — the tag carries only ours.",
    pixelNotInTag: "Not in the tag with the current settings.",
    pixelTypes: {
      impression: "Impression",
      error: "Error",
      click: "Click",
      viewable: "Viewable",
      notViewable: "Not viewable",
      viewUndetermined: "Viewability undetermined",
      companionView: "Banner view",
      companionClick: "Banner click",
      iconView: "AdChoices view",
      iconClick: "AdChoices click",
    },
    companionsHeading: "Companion banners",
    companionsHelp: "An image beside the player. Up to three sizes — the publisher shows the one that fits.",
    companion: "Banner {n}",
    companionImage: "Image",
    width: "Width, px",
    height: "Height, px",
    companionAlt: "Alternative text",
    addCompanion: "Add banner",
    removeCompanion: "Remove banner",
    companionClickThrough: "Banner destination URL",
    companionClickThroughHelp: "One for every banner, through our redirect too.",
    iconHeading: "AdChoices",
    iconOff: "No icon",
    iconOn: "With icon",
    iconProgram: "Program",
    iconImage: "Icon",
    iconCorner: "Corner",
    corners: {
      topLeft: "Top left",
      topRight: "Top right",
      bottomLeft: "Bottom left",
      bottomRight: "Bottom right",
    },
    iconOffset: "Appears at, seconds",
    iconDuration: "Shown for, seconds",
    iconDurationHelp: "Empty: until the spot ends.",
    iconClickThrough: "Icon destination URL",
    iconClickThroughHelp:
      "Usually an ads-and-data page. Opened directly, not through our redirect, and not counted as a click.",
    omidHeading: "OMID verification",
    omidOff: "No verification",
    omidOn: "With verification",
    omidVendor: "Vendor",
    omidVendorHelp: "The vendor key from their instructions, such as `company.com-omid`.",
    omidScript: "Vendor script",
    omidParameters: "Parameters",
    omidParametersHelp: "The string the vendor gave you, passed through as is.",
    uaidHeading: "UniversalAdId",
    uaidAuto: "Ours",
    uaidCustom: "Your own",
    uaidAutoHelp: "By default: the `creosmith` registry and the creative id.",
    uaidRegistry: "Registry",
    uaidValue: "Identifier",
    xmlHeading: "Tag XML",
    xmlCaption:
      "A preview: the tracking links here are placeholders. The real, signed ones are in the tag once it is saved.",
    xmlIncomplete: "The XML appears once the tag has a title and a video.",
    xmlBlocked: "The XML appears once the form has no errors — the button under the form marks them.",
    wellIdle:
      "The tag plays here. Nothing is pinged while you check — neither our trackers nor yours.",
    wellNeedsMedia: "Add a video to play the tag.",
    play: "Check and play",
    playing: "Checking",
    create: "Create creative",
    signInAndCreate: "Sign in and create",
    signInNote:
      "The creative is saved to My creatives, and the tag serves while you have closed-beta access. The draft stays in this browser.",
    save: "Save changes",
    saving: "Saving",
    cancel: "Cancel",
    draftRestored: "An unfinished draft was restored.",
    startOver: "Start over",
    fixErrors: "Fix the fields marked below.",
    issues: {
      bad_shape: "The value is in the wrong format.",
      required: "Required.",
      too_long: "Too long.",
      too_many: "Too many items.",
      too_large: "The settings are too large — remove some pixels or text.",
      bad_version: "Choose a VAST version.",
      bad_url: "Not a valid address: no spaces or angle brackets.",
      not_https: "Use https.",
      not_http: "Use an http(s) link.",
      script_scheme: "This link runs a script, so it is not allowed.",
      unknown_macro: "No player substitutes this macro in this kind of pixel. Keep to the standard VAST macros.",
      macro_in_host: "A macro cannot be part of the host: the player would fill it in and send the pixel to an address nobody checked.",
      destination_macro: "The click goes through our redirect, where nobody substitutes `[MACROS]`. Use {click_id} instead.",
      credentials_in_url: "The address carries a user name or password, which a browser will not send.",
      placeholder_value: "That is a placeholder, not an identifier: enter the registry's id or choose Ours.",
      own_host: "That is one of our addresses, and cannot be used here.",
      private_host: "A local-network address does not open for a viewer.",
      error_macro_missing: "Add the `[ERRORCODE]` macro — without it the cause of an error is unknown.",
      error_macro_unavailable: "This VAST version has no `[ERRORCODE]` macro.",
      not_own_media: "This file is not among your uploads — upload it again.",
      bad_mime: "Unsupported file type.",
      mime_mismatch: "The type does not match the file extension in the link.",
      out_of_range: "Out of range.",
      bad_event: "The chosen VAST version does not define this event.",
      duplicate: "This pixel is already there.",
    },
    errUnauthorized: "Your session expired — sign in again.",
    errSaveFailed: "The save failed. Try again.",
    errSelfCheck: "The tag failed our own check:",
    selfCheckIncomplete: "the check did not complete. Try saving again.",
    errMediaMissing: "One of the uploaded files is missing — upload it again.",
    errNotFound: "The creative was not found — it may have been deleted.",
    errStoredConfig:
      "This creative's saved settings cannot be read, so its tag now serves an empty VAST. Create the creative again in the generator.",
    editDroppedNotice:
      "Part of the saved settings no longer passes our checks and is not in the tag: {n}. Saving this form removes it.",
    runStale: "The tag has changed since the check — check again.",
    backToCreative: "Back to the creative",
    features: {
      advertiser: "advertiser",
      skip: "skip",
      icon: "AdChoices",
      universalAdId: "your own UniversalAdId",
      viewableImpression: "viewability pixels",
      companionClickTracking: "banner click pixels",
      omid: "OMID",
      thirdPartyError: "your error pixels",
      errorMacro: "[ERRORCODE]",
      adServingId: "AdServingId",
      events: "player events",
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
 * Heading for a `config_schema` group id (ADR-0011). Group ids come from the
 * database, so an unknown one degrades to the raw id rather than rendering a
 * headless section.
 */
export function groupLabel(dict: Dict, id: string): string {
  const labels = dict.configurator.groups as Record<string, string | undefined>;
  return labels[id] ?? id;
}
