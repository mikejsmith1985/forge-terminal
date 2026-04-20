import React, { useState, useMemo } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

// ── Lucide React (existing dep) ───────────────────────────────────────────────
import {
  Terminal, Code, Code2, Braces, FileCode, FileCode2, GitBranch, GitCommit,
  GitMerge, GitPullRequest, Github, Gitlab, Bug, Puzzle, Blocks, Box, Boxes,
  Package, Layers, Database, Server, Cloud, CloudUpload, CloudDownload,
  Play, PlayCircle, Pause, Square, RotateCcw, RefreshCw, Zap, Rocket,
  Send, Upload, Download, Save, Copy, Clipboard, ClipboardCheck,
  File, FileText, Files, Folder, FolderOpen, FolderGit, Archive,
  Settings, Wrench, Hammer, Cog, SlidersHorizontal, Filter, Search,
  MessageSquare, MessageCircle, Mail, Bell, Megaphone,
  Bot, Cpu, Brain, Sparkles, Wand2, Stars,
  Monitor, Laptop, Smartphone, HardDrive, Wifi, Globe, Link,
  Lock, Unlock, Key, Shield, ShieldCheck, ShieldAlert,
  Home, User, Users, Star, Heart, Bookmark, Tag, Flag,
  AlertTriangle, AlertCircle, Info, HelpCircle, CheckCircle, XCircle,
  Clock, Calendar, Timer, Activity, BarChart, BarChart2, BarChart3,
  PieChart, TrendingUp, TrendingDown, LineChart,
  Trash2, Edit, Eye, EyeOff, Power, LogOut, ExternalLink,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronRight, CornerDownRight,
  Flame, Leaf, Sun, Moon, Coffee, Pizza, Music, Gamepad2, Trophy,
  Network, Share2, Workflow, Webhook, Radio, Satellite,
  Container, FolderSync, GitFork, Merge, Split, Diff,
  FlaskConical, TestTube, Microscope, Atom,
  MapPin, Navigation, Compass,
  Pen, PenTool, Paintbrush, Palette,
  Table, Sheet, List, ListChecks, ListOrdered,
  Hash, AtSign, Slash, Variable,
  Lightbulb, Gauge, GaugeCircle,
  Binary, CircuitBoard, Microchip, MemoryStick,
  FileJson, FileCog, FileSearch, FileCheck,
  FolderClosed, FolderKanban, FolderTree,
  DatabaseZap, DatabaseBackup,
  ServerCrash, ServerOff, ServerCog,
  CloudCog, CloudOff, CloudLightning,
  PlugZap, Power as PowerIcon, Unplug,
  ScrollText, NotebookPen, BookOpen, Library,
  Terminal as TerminalSquare, Command, Keyboard,
  ChevronUp, ChevronDown, ChevronsUpDown,
  MoreHorizontal, MoreVertical, GripVertical,
  Layout, LayoutGrid, LayoutList, LayoutDashboard,
  Columns, Rows, Grid,
  Image, Video, Camera, Aperture,
  Headphones, Volume2, VolumeX,
  Siren, Radio as RadioIcon, Antenna,
  Package2, PackageCheck, PackageOpen,
  ShoppingCart, CreditCard, DollarSign, Banknote,
  Lock as LockIcon, KeyRound, Fingerprint, ScanLine,
  QrCode, Barcode,
  Rss, Cast, Share, Airplay,
  Maximize, Minimize, Expand, Shrink,
  RefreshCcw, IterationCcw, Repeat,
  Scissors, Crop, Slice,
  Move, GripHorizontal, PanelLeft, PanelRight,
  Focus, Target, Crosshair, Telescope,
  Magnet, Anchor, Link2, Unlink,
  Infinity, Sigma, Percent, Pi,
} from 'lucide-react';

// ── Tabler Icons — clean professional set (4,700+ icons) ─────────────────────
import {
  TbApi, TbBrandAws, TbBrandAzure,
  TbBrandDocker, TbBrandTerraform,
  TbBrandVercel, TbBrandCloudflare,
  TbBrandWindows, TbBrandApple, TbBrandAndroid,
  TbBrandGithub, TbBrandGitlab, TbBrandBitbucket,
  TbBrandVscode, TbBrandFigma, TbBrandSlack,
  TbBrandOpenai, TbBrandMongodb,
  TbBrandMysql,
  TbDatabase, TbDatabaseExport, TbDatabaseImport,
  TbServer, TbServerBolt, TbServerCog, TbServerOff,
  TbCloud, TbCloudLock, TbCloudUpload, TbCloudDownload, TbCloudBolt,
  TbBrandPython, TbBrandJavascript, TbBrandTypescript,
  TbBrandGolang, TbBrandRust,
  TbBrandReact, TbBrandVue, TbBrandAngular, TbBrandNextjs,
  TbBrandNodejs, TbBrandDeno,
  TbBrandCss3, TbBrandHtml5,
  TbBrandSwift, TbBrandKotlin,
  TbBrandPhp,
  TbApiApp, TbWebhook,
  TbTestPipe, TbTestPipe2,
  TbShieldLock, TbShieldCheck, TbShieldX,
  TbLock, TbLockOpen, TbKey,
  TbCpu, TbCpu2,
  TbCircuitResistor, TbMicrophone, TbHeadphones,
  TbTerminal, TbTerminal2,
  TbCode, TbCodeDots, TbCodePlus, TbCodeMinus,
  TbBug, TbBugOff,
  TbGitBranch, TbGitCommit, TbGitMerge, TbGitFork, TbGitPullRequest,
  TbBolt, TbBoltOff, TbRocket,
  TbSettings, TbSettingsCog, TbSettingsAutomation,
  TbDeviceLaptop, TbDeviceDesktop, TbDeviceMobile, TbDeviceTablet,
  TbNetwork, TbNetworkOff, TbShare,
  TbChartBar, TbChartLine, TbChartPie, TbChartArea,
  TbActivity, TbHeartbeat, TbAdjustments,
  TbSearch, TbZoomIn, TbZoomOut,
  TbFilter, TbFilterOff,
  TbArrowUp, TbArrowDown, TbArrowLeft, TbArrowRight,
  TbRefresh, TbReload,
  TbPlayerPlay, TbPlayerPause, TbPlayerStop,
  TbTrash, TbTrashX,
  TbEdit, TbEditOff,
  TbDownload, TbUpload,
  TbFile, TbFileCode, TbFileDatabase, TbFileCertificate,
  TbFolder, TbFolderOpen, TbFolderCode,
  TbMail, TbMailBolt,
  TbAlertTriangle, TbAlertCircle, TbCircleCheck, TbCircleX,
  TbInfoCircle,
  TbWorld, TbWorldCog, TbWorldUpload,
  TbPackage,
  TbCommand, TbKeyboard,
  TbVariable, TbMath, TbMathFunction,
  TbHash, TbAt,
  TbTrophy, TbStar, TbHeart, TbFlame,
  TbCoffee, TbPizza,
  TbLayoutDashboard, TbLayoutGrid, TbLayoutList,
  TbTable,
  TbNotes, TbNotebook,
  TbTag, TbTags,
  TbCalendar, TbClock, TbHistory,
  TbEye, TbEyeOff,
  TbLogs, TbReportAnalytics, TbReportSearch,
  TbAutomaticGearbox,
  TbBinaryTree, TbHierarchy,
  TbPlugConnected, TbPlugConnectedX,
  TbWifi, TbWifiOff,
  TbSatellite,
  TbCertificate, TbCertificate2,
  TbAtom, TbAtom2,
  TbBrain,
  TbSparkles,
  TbWand,
  TbMessageCode, TbMessages,
  TbSend, TbSendOff,
  TbCopy, TbCut,
  TbScissors,
  TbTarget, TbCrosshair,
  TbMaximize, TbMinimize,
  TbZip, TbArchive,
  TbDragDrop,
  TbSortAscending, TbSortDescending,
  TbArrowsShuffle,
  TbRepeat, TbRepeatOnce,
  TbNumbers,
  TbSum,
  TbDecimal,
  TbWriting,
  TbMarkdown,
  TbJson,
  TbFileTypeXml,
  TbSql,
  TbCsv,
  TbBraces,
  TbToml,
  TbTxt,
  TbBrandGit,
} from 'react-icons/tb';

// ── Simple Icons — brand & tech logos ────────────────────────────────────────
import {
  SiDocker, SiKubernetes, SiHelm, SiIstio,
  SiGooglecloud, SiCloudflare,
  SiHeroku, SiVercel, SiNetlify, SiRender,
  SiGithub, SiGitlab, SiBitbucket, SiGithubactions,
  SiPython, SiJavascript, SiTypescript, SiGo, SiRust,
  SiC, SiCplusplus, SiDotnet, SiKotlin, SiSwift,
  SiPhp, SiRuby, SiScala, SiElixir, SiErlang, SiHaskell,
  SiLua, SiPerl, SiR, SiJulia,
  SiReact, SiVuedotjs, SiAngular, SiSvelte, SiSolid,
  SiNextdotjs, SiNuxt, SiRemix, SiAstro,
  SiNodedotjs, SiDeno, SiBun, SiExpress, SiFastify,
  SiNestjs, SiDjango, SiFastapi, SiFlask,
  SiRubyonrails, SiLaravel, SiSpring,
  SiPostgresql, SiMysql, SiSqlite, SiMongodb, SiRedis,
  SiElasticsearch, SiApachecassandra, SiNeo4J, SiInfluxdb,
  SiNginx, SiApache, SiCaddy,
  SiTerraform, SiAnsible, SiPulumi, SiChef,
  SiJenkins, SiCircleci, SiTravisci, SiTeamcity,
  SiGrafana, SiPrometheus, SiDatadog, SiSplunk, SiSentry,
  SiSlack, SiDiscord, SiZoom,
  SiJira, SiConfluence, SiNotion, SiLinear,
  SiOpenai, SiAnthropic, SiHuggingface, SiOllama,
  SiNeovim, SiVim, SiJetbrains, SiIntellijidea,
  SiFigma, SiSketch,
  SiNpm, SiYarn, SiPnpm,
  SiWebpack, SiVite, SiEsbuild, SiRollupdotjs, SiBabel,
  SiEslint, SiPrettier,
  SiJest, SiVitest, SiCypress,
  SiGraphql, SiApollographql, SiPostman, SiInsomnia, SiSwagger,
  SiWebassembly,
  SiLinux, SiUbuntu, SiDebian, SiFedora, SiArchlinux, SiAlpinelinux,
  SiApple, SiAndroid,
  SiRaspberrypi, SiArduino,
  SiHashicorp, SiVault,
  SiLetsencrypt,
  SiCloudflareworkers, SiCloudflarepages,
  SiFirebase, SiSupabase, SiPlanetscale, SiTurso,
  SiStripe, SiTwilio, SiSendgrid,
  SiGit, SiGnubash,
  SiMarkdown, SiLatex,
  SiRabbitmq, SiApachekafka, SiNatsdotio,
} from 'react-icons/si';

// ── Phosphor Icons — beautiful multi-weight set ───────────────────────────────
import {
  PiTerminalWindow, PiTerminalBold, PiCode, PiCodeBlock,
  PiGitBranch, PiGitCommit, PiGitMerge, PiGitPullRequest, PiGitFork,
  PiDatabase, PiDatabaseBold, PiCloud,
  PiRocket, PiLightningBold, PiSparkle, PiMagicWand,
  PiRobot, PiBrain, PiCpu, PiDesktopTower,
  PiShieldCheck, PiShieldWarning, PiKey, PiLock,
  PiBug, PiVirus,
  PiArrowClockwise, PiArrowCounterClockwise,
  PiPlay, PiPause, PiStop, PiRecord,
  PiDownload, PiUpload, PiCloudArrowUp, PiCloudArrowDown,
  PiFolderOpen, PiFolder, PiFolderStar,
  PiFile, PiFileCode, PiFileMagnifyingGlass,
  PiMagnifyingGlass, PiMagnifyingGlassPlus,
  PiSliders, PiFaders, PiEqualizer,
  PiChartBar, PiChartLine, PiChartPie, PiChartDonut,
  PiPulse, PiWaveform,
  PiGraph, PiTreeStructure,
  PiGear, PiGearSix,
  PiWrench, PiHammer, PiScrewdriver,
  PiPackage,
  PiStack, PiRows, PiColumns,
  PiLayout, PiMonitor,
  PiClock, PiTimer, PiCalendar, PiHourglass,
  PiTag, PiFlag,
  PiHeart, PiStar, PiTrophy, PiMedal, PiCrown,
  PiFlame, PiDrop, PiWind,
  PiSun, PiMoon, PiCloud as PiCloudIcon,
  PiLeaf, PiTree, PiPlant,
  PiCoffee, PiBeerStein, PiCake,
  PiMusicNote, PiHeadphones, PiMicrophone,
  PiGameController, PiDiceSix,
  PiCamera, PiImage, PiVideo, PiFilmStrip,
  PiPaperclip, PiLink, PiShare,
  PiQrCode, PiBarcode,
  PiNotebook, PiBookOpen, PiPenNib, PiPencil,
  PiGlobe, PiMapTrifold, PiMapPin, PiCompass,
  PiUser, PiUsers, PiUsersThree,
  PiHouse, PiBuildings, PiCity,
  PiPhone, PiEnvelope, PiBell, PiChat,
  PiPaperPlane, PiMegaphone,
  PiQuestion, PiInfo, PiWarning, PiProhibit, PiCheck, PiX,
  PiArrowUp, PiArrowDown, PiArrowLeft, PiArrowRight,
  PiArrowsClockwise, PiArrowsOut, PiArrowsIn,
  PiDotsThree, PiDotsThreeVertical,
  PiTextT, PiHash, PiAt, PiPercent,
  PiInfinity, PiSigma, PiPi,
  PiArticle, PiParagraph,
  PiHandPointing, PiHandWaving,
  PiCertificate, PiIdentificationBadge, PiIdentificationCard,
  PiFlaskBold, PiTestTube, PiMicroscope,
  PiAtom, PiDna, PiBinary,
  PiProjectorScreen, PiPresentationChart,
  PiReceipt, PiCreditCard, PiMoney, PiCurrencyDollar,
  PiScissors, PiEraserBold,
  PiEyeBold, PiEyeSlash,
  PiLockKey, PiPasswordBold,
  PiDesktop, PiLaptop, PiDeviceMobile,
  PiPrinter, PiScanBold,
  PiPlug, PiPlugsConnected, PiUsb,
  PiHardDrives, PiMemory, PiCircuitry,
  PiWifiHigh, PiWifiSlash,
  PiCellTower, PiRadioactive,
  PiTabsLight, PiWindowsLogoBold,
} from 'react-icons/pi';

// ── Bootstrap Icons — solid, familiar shapes ──────────────────────────────────
import {
  BsTerminalFill, BsCodeSlash, BsBraces, BsFiletypeJson, BsFiletypeYml,
  BsFiletypeSql, BsFiletypeSh, BsFiletypePy, BsFiletypeTsx, BsFiletypeJs,
  BsFiletypeCss, BsFiletypeHtml,
  BsDatabaseFill, BsServer, BsCloudFill,
  BsShieldFillCheck, BsShieldFillExclamation, BsKeyFill, BsLockFill,
  BsBug, BsBugFill,
  BsRocket, BsRocketFill, BsRocketTakeoff,
  BsLightningFill, BsLightningChargeFill,
  BsPlay, BsPause, BsStop, BsRecord, BsSkipForward,
  BsGearFill, BsGearWide, BsTools, BsWrench,
  BsGridFill, BsLayoutSidebarReverse, BsLayoutSplit,
  BsGraphUp, BsGraphDown, BsBarChartFill, BsPieChartFill,
  BsActivity, BsHeartPulseFill,
  BsPersonFill, BsPeopleFill, BsPersonFillGear,
  BsHouseFill, BsBuildingFill, BsBuilding,
  BsGlobeAmericas, BsGlobeEuropeAfrica,
  BsBoxFill, BsBoxSeam, BsBoxes,
  BsEnvelopeFill, BsBellFill, BsChatFill, BsMegaphoneFill,
  BsStarFill, BsTrophyFill, BsHeartFill, BsFire,
  BsCheckCircleFill, BsXCircleFill, BsExclamationTriangleFill,
  BsInfoCircleFill, BsQuestionCircleFill,
  BsArrowRepeat, BsArrowClockwise, BsArrowCounterclockwise,
  BsClockFill, BsCalendarFill, BsCalendarEvent,
  BsTagFill, BsBookmarkFill, BsFlagFill,
  BsEyeFill, BsEyeSlashFill,
  BsClipboardFill, BsClipboardCheckFill,
  BsDownload, BsUpload, BsCloudDownloadFill, BsCloudUploadFill,
  BsTrashFill, BsPencilFill, BsScissors,
  BsCpuFill, BsMemory, BsMotherboardFill, BsHddFill,
  BsWifi, BsWifiOff,
  BsQrCodeScan, BsUpc, BsUpcScan,
  BsMusicNote, BsHeadphones, BsCameraFill, BsFilm,
  BsCreditCardFill, BsCashCoin,
  BsSendFill,
  BsSearch, BsFilter,
  BsLink45Deg, BsLink, BsShare,
  BsToggleOn, BsToggle2On,
  BsInputCursor, BsTextareaT,
  BsHash, BsAt, BsPercent,
  BsInfinity,
} from 'react-icons/bs';

// ── Font Awesome 6 — the classic ─────────────────────────────────────────────
import {
  FaDocker, FaAws, FaGoogle, FaMicrosoft, FaApple, FaLinux, FaWindows,
  FaGithub, FaGitlab, FaBitbucket, FaGit, FaNpm, FaYarn,
  FaPython, FaJs, FaPhp, FaJava, FaSwift, FaRust,
  FaReact, FaVuejs, FaAngular, FaNodeJs,
  FaServer, FaDatabase, FaCloud, FaCloudArrowUp, FaCloudArrowDown,
  FaTerminal, FaCode, FaCodeBranch, FaBug, FaRocket,
  FaLock, FaUnlock, FaKey, FaShieldHalved,
  FaUser, FaUsers, FaUserGear, FaUserShield,
  FaGear, FaGears, FaWrench, FaToolbox,
  FaPlay, FaPause, FaStop, FaForwardStep,
  FaUpload, FaDownload, FaFloppyDisk,
  FaFolder, FaFolderOpen, FaFile, FaFileCode, FaFileLines,
  FaMagnifyingGlass, FaFilter,
  FaBell, FaEnvelope, FaComment, FaComments,
  FaHouse, FaBuilding,
  FaStar, FaHeart, FaTrophy, FaMedal, FaAward, FaCrown,
  FaFire, FaBolt, FaWifi,
  FaTriangleExclamation, FaCircleXmark, FaCircleCheck, FaCircleInfo,
  FaClock, FaCalendar,
  FaTag, FaTags, FaBookmark, FaFlag,
  FaTrash, FaPencil, FaCopy, FaPaste,
  FaChartBar, FaChartLine, FaChartPie, FaChartArea,
  FaMoneyBillWave, FaCreditCard,
  FaGlobe, FaMap, FaLocationDot, FaCompass,
  FaCamera, FaImage, FaVideo, FaMusic, FaHeadphones, FaMicrophone,
  FaGamepad, FaDice,
  FaMugSaucer, FaPizzaSlice, FaBeerMugEmpty,
  FaLeaf, FaSeedling, FaSun, FaMoon,
  FaGraduationCap, FaFlask, FaMicroscope, FaAtom,
  FaIdCard, FaCertificate,
  FaBagShopping, FaStore,
  FaPaperPlane, FaBullhorn, FaTowerBroadcast,
  FaDiagramProject, FaSitemap, FaNetworkWired,
  FaExpand, FaCompress,
  FaSort, FaSortUp, FaSortDown,
  FaShuffle, FaRepeat,
  FaInfinity, FaPercent,
  FaHashtag, FaAt, FaLink, FaLinkSlash,
  FaQrcode, FaBarcode,
  FaBrain, FaRobot,
  FaSatelliteDish, FaSatellite,
  FaGavel, FaScaleBalanced,
  FaHandshake, FaThumbsUp, FaThumbsDown,
  FaEye, FaEyeSlash,
  FaPowerOff, FaArrowRightFromBracket, FaArrowRightToBracket,
  FaLaptop, FaMobile, FaTabletScreenButton, FaDesktop, FaPrint,
  FaKeyboard, FaComputerMouse, FaHeadset,
  FaMemory, FaHardDrive, FaMicrochip,
  FaScissors,
  FaMagnet, FaAnchor,
  FaBoxArchive, FaBox, FaBoxesStacked,
  FaLayerGroup, FaObjectGroup,
  FaBezierCurve, FaPen, FaPaintbrush, FaPalette,
  FaSliders, FaCompassDrafting,
  FaPlug, FaUsb,
  FaHospital, FaHeartPulse,
  FaRightLeft, FaArrowsRotate, FaRotateRight, FaRotateLeft,
} from 'react-icons/fa6';

// ─────────────────────────────────────────────────────────────────────────────
// Category definitions
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = {
  // ── Emoji picker (handled separately) ────────────────────────────────────
  'Emojis': { emoji: '😀', icons: [] },

  // ── Brands: Languages ─────────────────────────────────────────────────────
  'Languages': {
    emoji: '{ }',
    icons: [
      { name: 'si_Python',     Icon: SiPython,     label: 'Python' },
      { name: 'si_Javascript', Icon: SiJavascript, label: 'JavaScript' },
      { name: 'si_Typescript', Icon: SiTypescript, label: 'TypeScript' },
      { name: 'si_Go',         Icon: SiGo,         label: 'Go' },
      { name: 'si_Rust',       Icon: SiRust,       label: 'Rust' },
      { name: 'si_C',          Icon: SiC,          label: 'C' },
      { name: 'si_Cplusplus',  Icon: SiCplusplus,  label: 'C++' },
      { name: 'si_Csharp',     Icon: SiDotnet,     label: 'C#/.NET' },
      { name: 'si_Java',       Icon: FaJava,       label: 'Java' },
      { name: 'si_Kotlin',     Icon: SiKotlin,     label: 'Kotlin' },
      { name: 'si_Swift',      Icon: SiSwift,      label: 'Swift' },
      { name: 'si_Php',        Icon: SiPhp,        label: 'PHP' },
      { name: 'si_Ruby',       Icon: SiRuby,       label: 'Ruby' },
      { name: 'si_Scala',      Icon: SiScala,      label: 'Scala' },
      { name: 'si_Elixir',     Icon: SiElixir,     label: 'Elixir' },
      { name: 'si_Erlang',     Icon: SiErlang,     label: 'Erlang' },
      { name: 'si_Haskell',    Icon: SiHaskell,    label: 'Haskell' },
      { name: 'si_Lua',        Icon: SiLua,        label: 'Lua' },
      { name: 'si_R',          Icon: SiR,          label: 'R' },
      { name: 'si_Julia',      Icon: SiJulia,      label: 'Julia' },
      { name: 'si_Gnubash',    Icon: SiGnubash,    label: 'Bash' },
    ],
  },

  // ── Brands: Frameworks ────────────────────────────────────────────────────
  'Frameworks': {
    emoji: '🧩',
    icons: [
      { name: 'si_React',       Icon: SiReact,       label: 'React' },
      { name: 'si_Vuedotjs',    Icon: SiVuedotjs,    label: 'Vue.js' },
      { name: 'si_Angular',     Icon: SiAngular,     label: 'Angular' },
      { name: 'si_Svelte',      Icon: SiSvelte,      label: 'Svelte' },
      { name: 'si_Solid',       Icon: SiSolid,       label: 'SolidJS' },
      { name: 'si_Nextdotjs',   Icon: SiNextdotjs,   label: 'Next.js' },
      { name: 'si_Nuxtdotjs',   Icon: SiNuxt,        label: 'Nuxt.js' },
      { name: 'si_Remix',       Icon: SiRemix,       label: 'Remix' },
      { name: 'si_Astro',       Icon: SiAstro,       label: 'Astro' },
      { name: 'si_Nodedotjs',   Icon: SiNodedotjs,   label: 'Node.js' },
      { name: 'si_Deno',        Icon: SiDeno,        label: 'Deno' },
      { name: 'si_Bun',         Icon: SiBun,         label: 'Bun' },
      { name: 'si_Express',     Icon: SiExpress,     label: 'Express' },
      { name: 'si_Fastify',     Icon: SiFastify,     label: 'Fastify' },
      { name: 'si_Nestjs',      Icon: SiNestjs,      label: 'NestJS' },
      { name: 'si_Django',      Icon: SiDjango,      label: 'Django' },
      { name: 'si_Fastapi',     Icon: SiFastapi,     label: 'FastAPI' },
      { name: 'si_Flask',       Icon: SiFlask,       label: 'Flask' },
      { name: 'si_Rails',       Icon: SiRubyonrails, label: 'Rails' },
      { name: 'si_Laravel',     Icon: SiLaravel,     label: 'Laravel' },
      { name: 'si_Spring',      Icon: SiSpring,      label: 'Spring' },
    ],
  },

  // ── Brands: Cloud & DevOps ────────────────────────────────────────────────
  'Cloud & DevOps': {
    emoji: '☁️',
    icons: [
      { name: 'si_Amazonaws',      Icon: FaAws,            label: 'AWS' },
      { name: 'si_Googlecloud',    Icon: SiGooglecloud,    label: 'Google Cloud' },
      { name: 'si_Microsoftazure', Icon: TbBrandAzure,     label: 'Azure' },
      { name: 'si_Cloudflare',     Icon: SiCloudflare,     label: 'Cloudflare' },
      { name: 'si_Vercel',         Icon: SiVercel,         label: 'Vercel' },
      { name: 'si_Netlify',        Icon: SiNetlify,        label: 'Netlify' },
      { name: 'si_Heroku',         Icon: SiHeroku,         label: 'Heroku' },
      { name: 'si_Render',         Icon: SiRender,         label: 'Render' },
      { name: 'si_Firebase',       Icon: SiFirebase,       label: 'Firebase' },
      { name: 'si_Supabase',       Icon: SiSupabase,       label: 'Supabase' },
      { name: 'si_Turso',          Icon: SiTurso,          label: 'Turso' },
      { name: 'si_Docker',         Icon: SiDocker,         label: 'Docker' },
      { name: 'si_Kubernetes',     Icon: SiKubernetes,     label: 'Kubernetes' },
      { name: 'si_Helm',           Icon: SiHelm,           label: 'Helm' },
      { name: 'si_Terraform',      Icon: SiTerraform,      label: 'Terraform' },
      { name: 'si_Ansible',        Icon: SiAnsible,        label: 'Ansible' },
      { name: 'si_Pulumi',         Icon: SiPulumi,         label: 'Pulumi' },
      { name: 'si_Githubactions',  Icon: SiGithubactions,  label: 'GitHub Actions' },
      { name: 'si_Jenkins',        Icon: SiJenkins,        label: 'Jenkins' },
      { name: 'si_Circleci',       Icon: SiCircleci,       label: 'CircleCI' },
      { name: 'si_HashiCorp',      Icon: SiHashicorp,      label: 'HashiCorp' },
      { name: 'si_Vault',          Icon: SiVault,          label: 'Vault' },
      { name: 'si_CloudflareWorkers', Icon: SiCloudflareworkers, label: 'CF Workers' },
    ],
  },

  // ── Brands: Databases ─────────────────────────────────────────────────────
  'Databases': {
    emoji: '🗄️',
    icons: [
      { name: 'si_Postgresql',       Icon: SiPostgresql,       label: 'PostgreSQL' },
      { name: 'si_Mysql',            Icon: SiMysql,            label: 'MySQL' },
      { name: 'si_Sqlite',           Icon: SiSqlite,           label: 'SQLite' },
      { name: 'si_Mongodb',          Icon: SiMongodb,          label: 'MongoDB' },
      { name: 'si_Redis',            Icon: SiRedis,            label: 'Redis' },
      { name: 'si_Elasticsearch',    Icon: SiElasticsearch,    label: 'Elasticsearch' },
      { name: 'si_Cassandra',        Icon: SiApachecassandra,  label: 'Cassandra' },
      { name: 'si_Neo4j',            Icon: SiNeo4J,            label: 'Neo4j' },
      { name: 'si_Influxdb',         Icon: SiInfluxdb,         label: 'InfluxDB' },
      { name: 'si_Planetscale',      Icon: SiPlanetscale,      label: 'PlanetScale' },
      { name: 'si_Rabbitmq',         Icon: SiRabbitmq,         label: 'RabbitMQ' },
      { name: 'si_Kafka',            Icon: SiApachekafka,      label: 'Kafka' },
      { name: 'si_Natsdotio',          Icon: SiNatsdotio,          label: 'NATS' },
    ],
  },

  // ── Brands: Tools & Platforms ─────────────────────────────────────────────
  'Tools & Platforms': {
    emoji: '🛠️',
    icons: [
      { name: 'si_Github',    Icon: SiGithub,    label: 'GitHub' },
      { name: 'si_Gitlab',    Icon: SiGitlab,    label: 'GitLab' },
      { name: 'si_Bitbucket', Icon: SiBitbucket, label: 'Bitbucket' },
      { name: 'si_Git',       Icon: SiGit,       label: 'Git' },
      { name: 'si_Vscode',    Icon: TbBrandVscode, label: 'VS Code' },
      { name: 'si_Neovim',    Icon: SiNeovim,    label: 'Neovim' },
      { name: 'si_Vim',       Icon: SiVim,       label: 'Vim' },
      { name: 'si_JetBrains', Icon: SiJetbrains, label: 'JetBrains' },
      { name: 'si_Figma',     Icon: SiFigma,     label: 'Figma' },
      { name: 'si_Slack',     Icon: SiSlack,     label: 'Slack' },
      { name: 'si_Discord',   Icon: SiDiscord,   label: 'Discord' },
      { name: 'si_Notion',    Icon: SiNotion,    label: 'Notion' },
      { name: 'si_Jira',      Icon: SiJira,      label: 'Jira' },
      { name: 'si_Linear',    Icon: SiLinear,    label: 'Linear' },
      { name: 'si_Openai',    Icon: SiOpenai,    label: 'OpenAI' },
      { name: 'si_Anthropic', Icon: SiAnthropic, label: 'Anthropic' },
      { name: 'si_Huggingface',Icon: SiHuggingface,label: 'Hugging Face' },
      { name: 'si_Grafana',   Icon: SiGrafana,   label: 'Grafana' },
      { name: 'si_Datadog',   Icon: SiDatadog,   label: 'Datadog' },
      { name: 'si_Sentry',    Icon: SiSentry,    label: 'Sentry' },
      { name: 'si_Postman',   Icon: SiPostman,   label: 'Postman' },
      { name: 'si_Swagger',   Icon: SiSwagger,   label: 'Swagger' },
      { name: 'si_Graphql',   Icon: SiGraphql,   label: 'GraphQL' },
      { name: 'si_Stripe',    Icon: SiStripe,    label: 'Stripe' },
      { name: 'si_Npm',       Icon: SiNpm,       label: 'npm' },
      { name: 'si_Yarn',      Icon: SiYarn,      label: 'Yarn' },
      { name: 'si_Pnpm',      Icon: SiPnpm,      label: 'pnpm' },
      { name: 'si_Vite',      Icon: SiVite,      label: 'Vite' },
      { name: 'si_Eslint',    Icon: SiEslint,    label: 'ESLint' },
      { name: 'si_Jest',      Icon: SiJest,      label: 'Jest' },
      { name: 'si_Vitest',    Icon: SiVitest,    label: 'Vitest' },
      { name: 'si_Nginx',     Icon: SiNginx,     label: 'Nginx' },
      { name: 'si_Linux',     Icon: SiLinux,     label: 'Linux' },
      { name: 'si_Ubuntu',    Icon: SiUbuntu,    label: 'Ubuntu' },
    ],
  },

  // ── Development (Lucide + Tabler) ─────────────────────────────────────────
  'Dev & Code': {
    emoji: '⌨️',
    icons: [
      { name: 'Terminal',    Icon: Terminal,    label: 'Terminal' },
      { name: 'Code',        Icon: Code,        label: 'Code' },
      { name: 'Code2',       Icon: Code2,       label: 'Code Alt' },
      { name: 'Braces',      Icon: Braces,      label: 'Braces' },
      { name: 'FileCode',    Icon: FileCode,    label: 'File Code' },
      { name: 'Binary',      Icon: Binary,      label: 'Binary' },
      { name: 'Variable',    Icon: Variable,    label: 'Variable' },
      { name: 'Hash',        Icon: Hash,        label: 'Hash' },
      { name: 'AtSign',      Icon: AtSign,      label: 'At Sign' },
      { name: 'Bug',         Icon: Bug,         label: 'Bug' },
      { name: 'Puzzle',      Icon: Puzzle,      label: 'Puzzle' },
      { name: 'Blocks',      Icon: Blocks,      label: 'Blocks' },
      { name: 'CircuitBoard',Icon: CircuitBoard, label: 'Circuit' },
      { name: 'Microchip',   Icon: Microchip,   label: 'Microchip' },
      { name: 'Command',     Icon: Command,     label: 'Command' },
      { name: 'Keyboard',    Icon: Keyboard,    label: 'Keyboard' },
      { name: 'FileJson',    Icon: FileJson,    label: 'JSON File' },
      { name: 'FileCog',     Icon: FileCog,     label: 'Config File' },
      { name: 'ScrollText',  Icon: ScrollText,  label: 'Script' },
      { name: 'FlaskConical',Icon: FlaskConical, label: 'Test Flask' },
      { name: 'TestTube',    Icon: TestTube,    label: 'Test Tube' },
      { name: 'Webhook',     Icon: Webhook,     label: 'Webhook' },
      { name: 'Network',     Icon: Network,     label: 'Network' },
      { name: 'Share2',      Icon: Share2,      label: 'Share' },
      { name: 'Workflow',    Icon: Workflow,    label: 'Workflow' },
      { name: 'Bot',         Icon: Bot,         label: 'Bot' },
      { name: 'Brain',       Icon: Brain,       label: 'Brain' },
      { name: 'Sparkles',    Icon: Sparkles,    label: 'Sparkles' },
      { name: 'Wand2',       Icon: Wand2,       label: 'Magic Wand' },
      { name: 'Cpu',         Icon: Cpu,         label: 'CPU' },
    ],
  },

  // ── Git & Source Control ──────────────────────────────────────────────────
  'Git & CI': {
    emoji: '🌿',
    icons: [
      { name: 'GitBranch',       Icon: GitBranch,       label: 'Git Branch' },
      { name: 'GitCommit',       Icon: GitCommit,       label: 'Git Commit' },
      { name: 'GitMerge',        Icon: GitMerge,        label: 'Git Merge' },
      { name: 'GitPullRequest',  Icon: GitPullRequest,  label: 'Pull Request' },
      { name: 'GitFork',         Icon: GitFork,         label: 'Fork' },
      { name: 'Github',          Icon: Github,          label: 'GitHub' },
      { name: 'Gitlab',          Icon: Gitlab,          label: 'GitLab' },
      { name: 'Diff',            Icon: Diff,            label: 'Diff' },
      { name: 'Merge',           Icon: Merge,           label: 'Merge' },
      { name: 'tb_TbGitBranch',  Icon: TbGitBranch,    label: 'TB Branch' },
      { name: 'tb_TbGitFork',    Icon: TbGitFork,      label: 'TB Fork' },
      { name: 'tb_TbBrandGit',   Icon: TbBrandGit,     label: 'Git Logo' },
    ],
  },

  // ── Infrastructure ────────────────────────────────────────────────────────
  'Infrastructure': {
    emoji: '🏗️',
    icons: [
      { name: 'Server',          Icon: Server,          label: 'Server' },
      { name: 'Database',        Icon: Database,        label: 'Database' },
      { name: 'Cloud',           Icon: Cloud,           label: 'Cloud' },
      { name: 'CloudUpload',     Icon: CloudUpload,     label: 'Cloud Upload' },
      { name: 'CloudDownload',   Icon: CloudDownload,   label: 'Cloud Download' },
      { name: 'Package',         Icon: Package,         label: 'Package' },
      { name: 'Layers',          Icon: Layers,          label: 'Layers' },
      { name: 'Box',             Icon: Box,             label: 'Container' },
      { name: 'HardDrive',       Icon: HardDrive,       label: 'Hard Drive' },
      { name: 'Wifi',            Icon: Wifi,            label: 'Wifi' },
      { name: 'Globe',           Icon: Globe,           label: 'Globe' },
      { name: 'Link',            Icon: Link,            label: 'Link' },
      { name: 'ServerCog',       Icon: ServerCog,       label: 'Server Config' },
      { name: 'DatabaseZap',     Icon: DatabaseZap,     label: 'Database Fast' },
      { name: 'CloudCog',        Icon: CloudCog,        label: 'Cloud Config' },
      { name: 'PlugZap',         Icon: PlugZap,         label: 'Plug' },
      { name: 'Container',       Icon: Container,       label: 'Container' },
      { name: 'FolderSync',      Icon: FolderSync,      label: 'Sync' },
      { name: 'tb_TbApi',        Icon: TbApi,           label: 'API' },
      { name: 'tb_TbWebhook',    Icon: TbWebhook,       label: 'Webhook' },
      { name: 'tb_TbBrandAws',   Icon: TbBrandAws,      label: 'AWS' },
      { name: 'tb_TbBrandAzure', Icon: TbBrandAzure,    label: 'Azure' },
      { name: 'tb_TbBrandDocker',Icon: TbBrandDocker,   label: 'Docker' },
      { name: 'tb_TbBrandKubernetes', Icon: SiKubernetes,      label: 'K8s' },
      { name: 'tb_TbBrandTerraform', Icon: TbBrandTerraform, label: 'Terraform' },
      { name: 'tb_TbBrandVercel', Icon: TbBrandVercel,  label: 'Vercel' },
      { name: 'tb_TbBrandCloudflare', Icon: TbBrandCloudflare, label: 'Cloudflare' },
      { name: 'tb_TbBrandNginx', Icon: SiNginx,        label: 'Nginx' },
    ],
  },

  // ── Security ──────────────────────────────────────────────────────────────
  'Security': {
    emoji: '🔐',
    icons: [
      { name: 'Lock',            Icon: Lock,            label: 'Lock' },
      { name: 'Unlock',          Icon: Unlock,          label: 'Unlock' },
      { name: 'Key',             Icon: Key,             label: 'Key' },
      { name: 'KeyRound',        Icon: KeyRound,        label: 'Key Round' },
      { name: 'Shield',          Icon: Shield,          label: 'Shield' },
      { name: 'ShieldCheck',     Icon: ShieldCheck,     label: 'Shield OK' },
      { name: 'ShieldAlert',     Icon: ShieldAlert,     label: 'Shield Alert' },
      { name: 'Fingerprint',     Icon: Fingerprint,     label: 'Fingerprint' },
      { name: 'ScanLine',        Icon: ScanLine,        label: 'Scan' },
      { name: 'QrCode',          Icon: QrCode,          label: 'QR Code' },
      { name: 'tb_TbShieldLock', Icon: TbShieldLock,   label: 'Shield Lock' },
      { name: 'tb_TbCertificate',Icon: TbCertificate,  label: 'Certificate' },
      { name: 'si_Letsencrypt',  Icon: SiLetsencrypt,  label: "Let's Encrypt" },
      { name: 'si_HashiVault',   Icon: SiVault,        label: 'Vault' },
    ],
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  'Actions': {
    emoji: '▶️',
    icons: [
      { name: 'Play',            Icon: Play,            label: 'Play' },
      { name: 'PlayCircle',      Icon: PlayCircle,      label: 'Play Circle' },
      { name: 'Pause',           Icon: Pause,           label: 'Pause' },
      { name: 'Square',          Icon: Square,          label: 'Stop' },
      { name: 'Rocket',          Icon: Rocket,          label: 'Rocket' },
      { name: 'Zap',             Icon: Zap,             label: 'Zap' },
      { name: 'Send',            Icon: Send,            label: 'Send' },
      { name: 'RefreshCw',       Icon: RefreshCw,       label: 'Refresh' },
      { name: 'RotateCcw',       Icon: RotateCcw,       label: 'Undo' },
      { name: 'Download',        Icon: Download,        label: 'Download' },
      { name: 'Upload',          Icon: Upload,          label: 'Upload' },
      { name: 'Save',            Icon: Save,            label: 'Save' },
      { name: 'Copy',            Icon: Copy,            label: 'Copy' },
      { name: 'Clipboard',       Icon: Clipboard,       label: 'Clipboard' },
      { name: 'Repeat',          Icon: Repeat,          label: 'Repeat' },
      { name: 'RefreshCcw',      Icon: RefreshCcw,      label: 'Refresh CCW' },
      { name: 'Scissors',        Icon: Scissors,        label: 'Cut' },
      { name: 'Move',            Icon: Move,            label: 'Move' },
      { name: 'Target',          Icon: Target,          label: 'Target' },
      { name: 'Crosshair',       Icon: Crosshair,       label: 'Crosshair' },
    ],
  },

  // ── Files & Folders ───────────────────────────────────────────────────────
  'Files': {
    emoji: '📁',
    icons: [
      { name: 'File',         Icon: File,          label: 'File' },
      { name: 'FileText',     Icon: FileText,      label: 'Text File' },
      { name: 'FileCode',     Icon: FileCode,      label: 'Code File' },
      { name: 'FileJson',     Icon: FileJson,      label: 'JSON' },
      { name: 'FileCog',      Icon: FileCog,       label: 'Config' },
      { name: 'FileSearch',   Icon: FileSearch,    label: 'Search File' },
      { name: 'FileCheck',    Icon: FileCheck,     label: 'Check File' },
      { name: 'Files',        Icon: Files,         label: 'Files' },
      { name: 'Folder',       Icon: Folder,        label: 'Folder' },
      { name: 'FolderOpen',   Icon: FolderOpen,    label: 'Folder Open' },
      { name: 'FolderGit',    Icon: FolderGit,     label: 'Git Folder' },
      { name: 'FolderTree',   Icon: FolderTree,    label: 'Folder Tree' },
      { name: 'FolderClosed', Icon: FolderClosed,  label: 'Folder Closed' },
      { name: 'Archive',      Icon: Archive,       label: 'Archive' },
      { name: 'NotebookPen',  Icon: NotebookPen,   label: 'Notebook' },
      { name: 'BookOpen',     Icon: BookOpen,      label: 'Book' },
      { name: 'ScrollText',   Icon: ScrollText,    label: 'Scroll' },
      { name: 'Library',      Icon: Library,       label: 'Library' },
    ],
  },

  // ── Tools & Settings ──────────────────────────────────────────────────────
  'Tools': {
    emoji: '⚙️',
    icons: [
      { name: 'Settings',        Icon: Settings,        label: 'Settings' },
      { name: 'Cog',             Icon: Cog,             label: 'Cog' },
      { name: 'Wrench',          Icon: Wrench,          label: 'Wrench' },
      { name: 'Hammer',          Icon: Hammer,          label: 'Hammer' },
      { name: 'SlidersHorizontal',Icon: SlidersHorizontal,label: 'Sliders' },
      { name: 'Filter',          Icon: Filter,          label: 'Filter' },
      { name: 'Search',          Icon: Search,          label: 'Search' },
      { name: 'Edit',            Icon: Edit,            label: 'Edit' },
      { name: 'Trash2',          Icon: Trash2,          label: 'Delete' },
      { name: 'Eye',             Icon: Eye,             label: 'Eye' },
      { name: 'EyeOff',          Icon: EyeOff,          label: 'Hidden' },
      { name: 'Gauge',           Icon: Gauge,           label: 'Gauge' },
      { name: 'Palette',         Icon: Palette,         label: 'Palette' },
      { name: 'Paintbrush',      Icon: Paintbrush,      label: 'Paintbrush' },
      { name: 'PenTool',         Icon: PenTool,         label: 'Pen Tool' },
      { name: 'Table',           Icon: Table,           label: 'Table' },
      { name: 'LayoutDashboard', Icon: LayoutDashboard, label: 'Dashboard' },
      { name: 'LayoutGrid',      Icon: LayoutGrid,      label: 'Grid' },
      { name: 'Maximize',        Icon: Maximize,        label: 'Maximize' },
    ],
  },

  // ── Analytics & Data ──────────────────────────────────────────────────────
  'Analytics': {
    emoji: '📊',
    icons: [
      { name: 'BarChart',      Icon: BarChart,      label: 'Bar Chart' },
      { name: 'BarChart2',     Icon: BarChart2,     label: 'Bar Chart 2' },
      { name: 'BarChart3',     Icon: BarChart3,     label: 'Bar Chart 3' },
      { name: 'LineChart',     Icon: LineChart,     label: 'Line Chart' },
      { name: 'PieChart',      Icon: PieChart,      label: 'Pie Chart' },
      { name: 'TrendingUp',    Icon: TrendingUp,    label: 'Trending Up' },
      { name: 'TrendingDown',  Icon: TrendingDown,  label: 'Trending Down' },
      { name: 'Activity',      Icon: Activity,      label: 'Activity' },
      { name: 'Sigma',         Icon: Sigma,         label: 'Sigma' },
      { name: 'Infinity',      Icon: Infinity,      label: 'Infinity' },
      { name: 'Percent',       Icon: Percent,       label: 'Percent' },
      { name: 'Pi',            Icon: Pi,            label: 'Pi' },
      { name: 'tb_TbChartBar', Icon: TbChartBar,   label: 'TB Bar Chart' },
      { name: 'tb_TbChartLine',Icon: TbChartLine,  label: 'TB Line Chart' },
      { name: 'tb_TbHeartbeat', Icon: TbHeartbeat,  label: 'Pulse' },
      { name: 'tb_TbReportAnalytics', Icon: TbReportAnalytics, label: 'Report' },
      { name: 'pi_PiChartDonut', Icon: PiChartDonut, label: 'Donut Chart' },
    ],
  },

  // ── Status & Alerts ───────────────────────────────────────────────────────
  'Status': {
    emoji: '✅',
    icons: [
      { name: 'CheckCircle',    Icon: CheckCircle,    label: 'Success' },
      { name: 'XCircle',        Icon: XCircle,        label: 'Error' },
      { name: 'AlertTriangle',  Icon: AlertTriangle,  label: 'Warning' },
      { name: 'AlertCircle',    Icon: AlertCircle,    label: 'Alert' },
      { name: 'Info',           Icon: Info,           label: 'Info' },
      { name: 'HelpCircle',     Icon: HelpCircle,     label: 'Help' },
      { name: 'ShieldCheck',    Icon: ShieldCheck,    label: 'Secure' },
      { name: 'Activity',       Icon: Activity,       label: 'Activity' },
      { name: 'Clock',          Icon: Clock,          label: 'Clock' },
      { name: 'Timer',          Icon: Timer,          label: 'Timer' },
      { name: 'Calendar',       Icon: Calendar,       label: 'Calendar' },
      { name: 'Bell',           Icon: Bell,           label: 'Bell' },
      { name: 'Flag',           Icon: Flag,           label: 'Flag' },
      { name: 'Bookmark',       Icon: Bookmark,       label: 'Bookmark' },
      { name: 'Tag',            Icon: Tag,            label: 'Tag' },
      { name: 'Power',          Icon: Power,          label: 'Power' },
      { name: 'LogOut',         Icon: LogOut,         label: 'Log Out' },
    ],
  },

  // ── Communication ─────────────────────────────────────────────────────────
  'Communication': {
    emoji: '💬',
    icons: [
      { name: 'MessageSquare', Icon: MessageSquare, label: 'Message' },
      { name: 'MessageCircle', Icon: MessageCircle, label: 'Chat' },
      { name: 'Mail',          Icon: Mail,          label: 'Email' },
      { name: 'Bell',          Icon: Bell,          label: 'Notification' },
      { name: 'Megaphone',     Icon: Megaphone,     label: 'Megaphone' },
      { name: 'Send',          Icon: Send,          label: 'Send' },
      { name: 'Share2',        Icon: Share2,        label: 'Share' },
      { name: 'Rss',           Icon: Rss,           label: 'RSS' },
      { name: 'Cast',          Icon: Cast,          label: 'Cast' },
      { name: 'Radio',         Icon: Radio,         label: 'Radio' },
      { name: 'Satellite',     Icon: Satellite,     label: 'Satellite' },
    ],
  },

  // ── People & Identity ─────────────────────────────────────────────────────
  'People': {
    emoji: '👤',
    icons: [
      { name: 'User',  Icon: User,  label: 'User' },
      { name: 'Users', Icon: Users, label: 'Users' },
      { name: 'Home',  Icon: Home,  label: 'Home' },
      { name: 'Globe', Icon: Globe, label: 'Globe' },
      { name: 'MapPin',Icon: MapPin,label: 'Location' },
      { name: 'Compass',Icon: Compass,label: 'Compass' },
      { name: 'Navigation',Icon: Navigation,label: 'Navigate' },
      { name: 'CreditCard',Icon: CreditCard,label: 'Card' },
      { name: 'QrCode',Icon: QrCode,label: 'QR Code' },
    ],
  },

  // ── Phosphor Highlights ───────────────────────────────────────────────────
  'Phosphor': {
    emoji: '✦',
    icons: [
      { name: 'pi_TerminalWindow',  Icon: PiTerminalWindow,  label: 'Terminal' },
      { name: 'pi_TerminalBold',    Icon: PiTerminalBold,    label: 'Terminal Bold' },
      { name: 'pi_CodeBlock',       Icon: PiCodeBlock,       label: 'Code Block' },
      { name: 'pi_Rocket',          Icon: PiRocket,          label: 'Rocket' },
      { name: 'pi_LightningBold',   Icon: PiLightningBold,   label: 'Lightning' },
      { name: 'pi_Sparkle',         Icon: PiSparkle,         label: 'Sparkle' },
      { name: 'pi_MagicWand',       Icon: PiMagicWand,       label: 'Magic Wand' },
      { name: 'pi_Robot',           Icon: PiRobot,           label: 'Robot' },
      { name: 'pi_Brain',           Icon: PiBrain,           label: 'Brain' },
      { name: 'pi_Cpu',             Icon: PiCpu,             label: 'CPU' },
      { name: 'pi_Database',        Icon: PiDatabase,        label: 'Database' },
      { name: 'pi_DatabaseBold',    Icon: PiDatabaseBold,    label: 'DB Bold' },
      { name: 'pi_Server',          Icon: PiDesktopTower,    label: 'Server' },
      { name: 'pi_Cloud',           Icon: PiCloud,           label: 'Cloud' },
      { name: 'pi_ShieldCheck',     Icon: PiShieldCheck,     label: 'Shield' },
      { name: 'pi_Key',             Icon: PiKey,             label: 'Key' },
      { name: 'pi_Bug',             Icon: PiBug,             label: 'Bug' },
      { name: 'pi_Gears',           Icon: PiGearSix,         label: 'Gears' },
      { name: 'pi_GearBold',        Icon: PiGear,            label: 'Gear' },
      { name: 'pi_Wrench',          Icon: PiWrench,          label: 'Wrench' },
      { name: 'pi_Package',         Icon: PiPackage,         label: 'Package' },
      { name: 'pi_Stack',           Icon: PiStack,           label: 'Stack' },
      { name: 'pi_Graph',           Icon: PiGraph,           label: 'Graph' },
      { name: 'pi_TreeStructure',   Icon: PiTreeStructure,   label: 'Tree' },
      { name: 'pi_BinaryTree',      Icon: PiBinary,          label: 'Binary Tree' },
      { name: 'pi_Atom',            Icon: PiAtom,            label: 'Atom' },
      { name: 'pi_Dna',             Icon: PiDna,             label: 'DNA' },
      { name: 'pi_Certificate',     Icon: PiCertificate,     label: 'Certificate' },
      { name: 'pi_Fingerprint',     Icon: PiFingerprint,     label: 'Fingerprint' },
      { name: 'pi_CircuitBoard',    Icon: PiCircuitry,       label: 'Circuit' },
      { name: 'pi_Memory',          Icon: PiMemory,          label: 'Memory' },
      { name: 'pi_HardDrives',      Icon: PiHardDrives,      label: 'Drives' },
      { name: 'pi_Plugs',           Icon: PiPlugsConnected,  label: 'Connected' },
      { name: 'pi_WifiHigh',        Icon: PiWifiHigh,        label: 'WiFi' },
      { name: 'pi_Pulse',           Icon: PiPulse,           label: 'Pulse' },
      { name: 'pi_Waveform',        Icon: PiWaveform,        label: 'Waveform' },
      { name: 'pi_Faders',          Icon: PiFaders,          label: 'Faders' },
      { name: 'pi_Equalizer',       Icon: PiEqualizer,       label: 'Equalizer' },
      { name: 'pi_Sliders',         Icon: PiSliders,         label: 'Sliders' },
      { name: 'pi_Crown',           Icon: PiCrown,           label: 'Crown' },
      { name: 'pi_Medal',           Icon: PiMedal,           label: 'Medal' },
      { name: 'pi_Trophy',          Icon: PiTrophy,          label: 'Trophy' },
      { name: 'pi_Flame',           Icon: PiFlame,           label: 'Flame' },
      { name: 'pi_FlaskBold',       Icon: PiFlaskBold,       label: 'Flask' },
      { name: 'pi_Microscope',      Icon: PiMicroscope,      label: 'Microscope' },
      { name: 'pi_PresentationChart',Icon: PiPresentationChart, label: 'Presentation' },
      { name: 'pi_Notebook',        Icon: PiNotebook,        label: 'Notebook' },
      { name: 'pi_Article',         Icon: PiArticle,         label: 'Article' },
    ],
  },

  // ── Fun & Misc ────────────────────────────────────────────────────────────
  'Fun': {
    emoji: '🎯',
    icons: [
      { name: 'Flame',    Icon: Flame,    label: 'Fire' },
      { name: 'Coffee',   Icon: Coffee,   label: 'Coffee' },
      { name: 'Star',     Icon: Star,     label: 'Star' },
      { name: 'Heart',    Icon: Heart,    label: 'Heart' },
      { name: 'Trophy',   Icon: Trophy,   label: 'Trophy' },
      { name: 'Gamepad2', Icon: Gamepad2, label: 'Game' },
      { name: 'Music',    Icon: Music,    label: 'Music' },
      { name: 'Moon',     Icon: Moon,     label: 'Moon' },
      { name: 'Sun',      Icon: Sun,      label: 'Sun' },
      { name: 'Leaf',     Icon: Leaf,     label: 'Leaf' },
      { name: 'Pizza',    Icon: Pizza,    label: 'Pizza' },
      { name: 'Atom',     Icon: Atom,     label: 'Atom' },
      { name: 'Microscope',Icon: Microscope,label: 'Science' },
      { name: 'Target',   Icon: Target,   label: 'Target' },
      { name: 'Magnet',   Icon: Magnet,   label: 'Magnet' },
      { name: 'Anchor',   Icon: Anchor,   label: 'Anchor' },
      { name: 'Infinity', Icon: Infinity, label: 'Infinity' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// iconMap — maps stored string names back to components for rendering
// ─────────────────────────────────────────────────────────────────────────────

export const iconMap = {};

// Populate from all categories automatically
Object.values(CATEGORIES).forEach(({ icons }) => {
  icons.forEach(({ name, Icon }) => {
    iconMap[name] = Icon;
  });
});

// Also keep legacy Lucide names (backward compat — previously stored without prefix)
Object.assign(iconMap, {
  Bot, Cpu, Brain, Sparkles, Wand2, Stars, Zap,
  Terminal, Code, Code2, Braces, FileCode, FileCode2, Bug, Puzzle, Blocks,
  GitBranch, GitCommit, GitMerge, GitPullRequest, Github, Gitlab,
  Server, Database, Cloud, CloudUpload, CloudDownload, Package, Layers, Box, Boxes,
  Play, PlayCircle, Pause, Square, RotateCcw, RefreshCw, Rocket, Send, Upload, Download, Save, Copy, Clipboard, ClipboardCheck,
  File, FileText, Files, Folder, FolderOpen, FolderGit, Archive,
  Settings, Wrench, Hammer, Cog, SlidersHorizontal, Filter, Search, Edit, Trash2,
  CheckCircle, XCircle, AlertTriangle, AlertCircle, Info, ShieldCheck, Activity, Clock,
  Flame, Coffee, Star, Heart, Trophy, Gamepad2, Music, Moon,
  MessageSquare, MessageCircle, Mail, Bell, Megaphone,
  Monitor, Laptop, Smartphone, HardDrive, Wifi, Globe, Link,
  Lock, Unlock, Key, Shield,
  Home, User, Users, Bookmark, Tag, Flag, Calendar, Timer, BarChart, PieChart, TrendingUp,
  Eye, EyeOff, Power, LogOut, ExternalLink,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronRight, CornerDownRight,
  Leaf, Sun, Pizza,
});

// ─────────────────────────────────────────────────────────────────────────────
// Emoji helpers (unchanged for backward compat)
// ─────────────────────────────────────────────────────────────────────────────

export const emojiMap = {
  'emoji-robot': '🤖', 'emoji-rocket': '🚀', 'emoji-fire': '🔥',
  'emoji-sparkles': '✨', 'emoji-star': '⭐', 'emoji-lightning': '⚡',
  'emoji-brain': '🧠', 'emoji-bulb': '💡', 'emoji-gear': '⚙️',
  'emoji-wrench': '🔧', 'emoji-hammer': '🔨', 'emoji-link': '🔗',
  'emoji-package': '📦', 'emoji-folder': '📁', 'emoji-file': '📄',
  'emoji-code': '💻', 'emoji-terminal': '🖥️', 'emoji-bug': '🐛',
  'emoji-check': '✅', 'emoji-cross': '❌', 'emoji-warning': '⚠️',
  'emoji-stop': '🛑', 'emoji-play': '▶️', 'emoji-target': '🎯',
  'emoji-trophy': '🏆', 'emoji-medal': '🥇', 'emoji-gem': '💎',
  'emoji-crystal': '🔮', 'emoji-paint': '🎨', 'emoji-music': '🎵',
  'emoji-coffee': '☕', 'emoji-pizza': '🍕', 'emoji-heart': '❤️',
  'emoji-thumbsup': '👍', 'emoji-clap': '👏', 'emoji-wave': '👋',
  'emoji-eyes': '👀', 'emoji-100': '💯', 'emoji-boom': '💥',
  'emoji-zap': '💨',
};

export const getEmojiFromIcon = (iconName) => {
  if (!iconName) return null;
  if (iconName.startsWith('emoji-')) return emojiMap[iconName] || null;
  if (iconName.length <= 4 && /\p{Emoji}/u.test(iconName)) return iconName;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// IconPicker component
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_NAMES = Object.keys(CATEGORIES);

const IconPicker = ({ selectedIcon, onSelect }) => {
  const [activeCategory, setActiveCategory] = useState('Emojis');
  const [searchTerm, setSearchTerm] = useState('');

  const handleEmojiSelect = (emoji) => onSelect(emoji.native);

  const filteredIcons = useMemo(() => {
    if (activeCategory === 'Emojis') return [];
    const icons = CATEGORIES[activeCategory]?.icons || [];
    if (!searchTerm.trim()) return icons;
    const q = searchTerm.toLowerCase();
    // Search across all categories when a term is entered
    const all = CATEGORY_NAMES.flatMap(c => CATEGORIES[c].icons || []);
    return all.filter(i => i.label?.toLowerCase().includes(q) || i.name?.toLowerCase().includes(q));
  }, [activeCategory, searchTerm]);

  const isSearching = searchTerm.trim().length > 0;

  return (
    <div className="icon-picker">
      {/* Search bar */}
      <div className="icon-picker-header">
        <input
          type="text"
          placeholder="Search all icons…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="icon-search"
        />
      </div>

      {/* Category tabs */}
      {!isSearching && (
        <div className="icon-categories">
          {CATEGORY_NAMES.map(cat => (
            <button
              key={cat}
              className={`category-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
              title={cat}
            >
              <span style={{ fontSize: '11px', marginRight: '4px' }}>
                {CATEGORIES[cat].emoji}
              </span>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Emoji mart */}
      {activeCategory === 'Emojis' && !isSearching ? (
        <div className="emoji-picker-container">
          <Picker
            data={data}
            onEmojiSelect={handleEmojiSelect}
            theme="dark"
            previewPosition="none"
            skinTonePosition="search"
            maxFrequentRows={2}
          />
        </div>
      ) : (
        <div className="icon-grid">
          {/* "None" option */}
          <button
            className={`icon-option ${!selectedIcon ? 'selected' : ''}`}
            onClick={() => onSelect(null)}
            title="No icon"
          >
            <span style={{ color: '#555', fontSize: '14px' }}>∅</span>
          </button>

          {filteredIcons.map(({ name, Icon, label }) => (
            <button
              key={name}
              className={`icon-option ${selectedIcon === name ? 'selected' : ''}`}
              onClick={() => onSelect(name)}
              title={label}
            >
              <Icon size={18} />
            </button>
          ))}

          {filteredIcons.length === 0 && isSearching && (
            <div style={{ gridColumn: '1/-1', color: '#555', fontSize: '12px', padding: '16px', textAlign: 'center' }}>
              No icons found for "{searchTerm}"
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IconPicker;
