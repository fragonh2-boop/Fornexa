/**
 * Copy e inventario de superficies públicas de FORNEXA.
 *
 * Contenido deliberadamente descriptivo de lo que la plataforma HACE, sin
 * validez jurídica atribuida, sin métricas de tracción y sin nombres de
 * empresas reales. El estado de madurez se declara en `status`.
 */

export type Language = "es" | "en" | "fr";

export const SITE_LANGUAGES: { id: Language; label: string }[] = [
  { id: "es", label: "ES" },
  { id: "en", label: "EN" },
  { id: "fr", label: "FR" },
];

export type Capability = { title: string; summary: string; items: string[] };
export type Advantage = { title: string; summary: string };
export type PublicSurface = { label: string; href?: string; summary: string };

export type SiteCopy = {
  tagline: string;
  nav: { platform: string; capabilities: string; modules: string; contact: string; tracking: string };
  login: string;
  language: string;
  hero: {
    title: string;
    rotatingLabel: string;
    lead: string;
    platformCta: string;
    trackingCta: string;
    accessKicker: string;
    access: string;
    accessNote: string;
  };
  what: { eyebrow: string; title: string; body: string };
  capabilities: { eyebrow: string; title: string; lead: string; items: Capability[] };
  advantages: { eyebrow: string; title: string; items: Advantage[] };
  modules: { eyebrow: string; title: string; lead: string; note: string };
  surfaces: { eyebrow: string; title: string; lead: string; tokenNote: string; items: PublicSurface[] };
  status: {
    eyebrow: string;
    title: string;
    lead: string;
    liveTitle: string;
    live: string[];
    preparingTitle: string;
    preparing: string[];
  };
  cta: { title: string; body: string; button: string };
  contact: {
    eyebrow: string;
    title: string;
    body: string;
    emailLabel: string;
    email: string;
    note: string;
    noFormTitle: string;
    noForm: string;
  };
  footer: { note: string; memorandum: string; tracking: string; login: string };
};

export const CONTACT_EMAIL = "fornexa@fornexasc.com";

/** Nombres de producto: no se traducen. Enlazan a la página de plataforma. */
export const fornexaModules: { name: string; href: string }[] = [
  { name: "Control Tower", href: "/plataforma#modulos" },
  { name: "Órdenes", href: "/plataforma#modulos" },
  { name: "Expediciones", href: "/plataforma#modulos" },
  { name: "Viajes", href: "/plataforma#modulos" },
  { name: "Aduanas", href: "/plataforma#modulos" },
  { name: "Ofertas y tarifas", href: "/plataforma#modulos" },
  { name: "Clientes", href: "/plataforma#modulos" },
  { name: "Artículos", href: "/plataforma#modulos" },
  { name: "Colaboradores", href: "/plataforma#modulos" },
  { name: "Almacenes", href: "/plataforma#modulos" },
  { name: "Muelles", href: "/plataforma#modulos" },
  { name: "Tracking", href: "/plataforma#modulos" },
  { name: "Trazabilidad", href: "/plataforma#modulos" },
  { name: "Documentos", href: "/plataforma#modulos" },
  { name: "Configuración", href: "/plataforma#modulos" },
  { name: "Informes", href: "/plataforma#modulos" },
];

/** Capacidad mostrada en la portada. Nombres de módulo, no traducciones de otro producto. */
export const rotatingCapabilities: Record<Language, string[]> = {
  es: [
    "Órdenes y expediciones",
    "Planificación de viajes",
    "Citas de muelle",
    "CMR y prueba de entrega",
    "Aduanas y documentos",
    "Almacén e inventario",
    "Tarifas y ofertas",
    "Tracking y trazabilidad",
  ],
  en: [
    "Orders and shipments",
    "Trip planning",
    "Dock appointments",
    "CMR and proof of delivery",
    "Customs and documents",
    "Warehouse and inventory",
    "Tariffs and quotes",
    "Tracking and traceability",
  ],
  fr: [
    "Commandes et expéditions",
    "Planification des voyages",
    "Rendez-vous à quai",
    "CMR et preuve de livraison",
    "Douane et documents",
    "Entrepôt et stock",
    "Tarifs et offres",
    "Suivi et traçabilité",
  ],
};

export const siteCopy: Record<Language, SiteCopy> = {
  es: {
    tagline: "Orquestación logística",
    nav: {
      platform: "Plataforma",
      capabilities: "Capacidades",
      modules: "Módulos",
      contact: "Contacto",
      tracking: "Tracking",
    },
    login: "Iniciar sesión",
    language: "Idioma",
    hero: {
      title: "Una plataforma; control total",
      rotatingLabel: "FORNEXA",
      lead: "Pedidos, expediciones, viajes, documento de transporte, aduanas, almacén, tarifas y tracking sobre un mismo modelo de datos, con aislamiento por organización.",
      platformCta: "Ver la plataforma",
      trackingCta: "Seguir un envío",
      accessKicker: "FORNEXA ACCESS",
      access: "Ir al acceso seguro",
      accessNote:
        "El acceso a FORNEXA se realiza únicamente desde el portal seguro de autenticación.",
    },
    what: {
      eyebrow: "Qué es",
      title: "Un solo modelo, toda la operación",
      body: "FORNEXA orquesta la operación logística de principio a fin: desde la orden y la expedición hasta el viaje que la mueve, el documento que la acompaña y el evento que la cierra. Cada dominio conserva su identidad —una expedición no es un viaje— y lo externo se adapta a ese modelo en lugar de duplicarse.",
    },
    capabilities: {
      eyebrow: "Capacidades",
      title: "Qué resuelve la plataforma",
      lead: "Cuatro ejes que cubren el ciclo completo, del pedido a la entrega documentada.",
      items: [
        {
          title: "Planificación",
          summary:
            "Convertir la demanda en viajes ejecutables, con sus paradas, ventanas y recursos.",
          items: [
            "Órdenes, expediciones y viajes con cardinalidad explícita",
            "Paradas con secuencia, ventana y estado reales",
            "Citas de muelle y disponibilidad por almacén",
            "Calendario de servicio y excepciones por dirección",
          ],
        },
        {
          title: "Colaboración",
          summary:
            "Trabajar con clientes, transportistas y cargadores sin sacarlos del modelo.",
          items: [
            "Clientes, colaboradores y perfiles de transportista",
            "Ofertas y tarifas por cliente y servicio",
            "Reserva de muelle con acceso temporal revocable",
            "Bloqueos y homologación de colaboradores",
          ],
        },
        {
          title: "Ejecución",
          summary:
            "Registrar lo que ocurre en la carretera, en la aduana y en el almacén.",
          items: [
            "Documento de transporte y prueba de entrega con firma y evidencia",
            "Eventos de transporte y timeline por parada",
            "Almacén: ubicaciones, inventario y movimientos",
            "Tracking público por referencia, sin sesión",
          ],
        },
        {
          title: "Coste y cumplimiento",
          summary:
            "Calcular el precio y sostener el expediente documental de la operación.",
          items: [
            "Motor de tarifas y cálculo de precios trazable",
            "Expediente de aduanas y documentos regulatorios",
            "Evaluación de mercancías peligrosas (ADR)",
            "Informes derivados de eventos, no de campos inventados",
          ],
        },
      ],
    },
    advantages: {
      eyebrow: "Ventajas",
      title: "Por qué está construido así",
      items: [
        {
          title: "Trazabilidad de extremo a extremo",
          summary:
            "Desde un EAN, SKU, lote o número de serie hasta sus viajes, movimientos de almacén, documentos y quién los leyó o movió.",
        },
        {
          title: "Operación en tiempo real",
          summary:
            "Control Tower y estados por parada alimentados por eventos, para ver la operación mientras ocurre y no al día siguiente.",
        },
        {
          title: "Modelo canónico",
          summary:
            "Cada dominio tiene una única fuente de verdad. Lo que llega de fuera se adapta al modelo; no se copian matrículas, conductores ni tarifas dentro de otros documentos.",
        },
        {
          title: "Aislamiento por organización",
          summary:
            "Toda consulta se filtra por organización y la base de datos aplica seguridad a nivel de fila, para que una operación no pueda ver la de otra.",
        },
      ],
    },
    modules: {
      eyebrow: "Módulos",
      title: "Un módulo por dominio",
      lead: "Cada área de la operación tiene su propia pantalla, con el mismo lenguaje visual y la misma lógica.",
      note: "El detalle de cada módulo, y su estado real, está en la página de plataforma.",
    },
    surfaces: {
      eyebrow: "Superficies públicas",
      title: "Lo que se puede usar sin sesión",
      lead: "Puntos de acceso acotados y con token, pensados para terceros que no son usuarios de la plataforma.",
      tokenNote: "Acceso con clave o token facilitado por el operador.",
      items: [
        {
          label: "Tracking",
          href: "/tracking",
          summary: "Seguimiento de un envío por su referencia, con aviso de dígito de control.",
        },
        {
          label: "Documento de transporte",
         
          summary: "Consulta acotada de un documento por su clave de acceso, revocable y con caducidad.",
        },
        {
          label: "Documentos regulatorios",
         
          summary: "Acceso por token a un expediente documental concreto.",
        },
        {
          label: "Memorándum",
          href: "/memorandum",
          summary: "Registro público de lo que la plataforma incorpora y de lo que queda pendiente.",
        },
      ],
    },
    status: {
      eyebrow: "Estado real",
      title: "Qué está listo y qué no",
      lead: "Preferimos decirlo aquí antes que dejarlo a la interpretación de una web.",
      liveTitle: "En funcionamiento",
      live: [
        "Aplicación web desplegada y navegable, con módulos por dominio.",
        "Aislamiento por organización aplicado en la base de datos.",
        "Superficies públicas con token revocable y con caducidad.",
        "Memorándum público con el estado de cada incorporación.",
      ],
      preparingTitle: "En preparación o sin verificar",
      preparing: [
        "Integraciones con proveedores de telemetría y sistemas de terceros: configurables, sin conectores activos.",
        "Conexión con la administración aduanera: el expediente y los documentos están modelados; no hay intercambio real.",
        "Validez jurídica de la firma y del documento electrónico: no verificada ni dictaminada.",
        "Datos de cliente reales: la plataforma se muestra con datos de prueba.",
      ],
    },
    cta: {
      title: "¿Quieres verlo con tus datos?",
      body: "Cuéntanos qué operación quieres orquestar y te enseñamos el recorrido completo, del pedido a la entrega documentada.",
      button: "Hablar con FORNEXA",
    },
    contact: {
      eyebrow: "Contacto",
      title: "Hablemos de tu operación",
      body: "Escríbenos y te respondemos con una propuesta de recorrido sobre tus propios procesos: pedidos, expediciones, viajes, documento de transporte, aduanas, almacén y tarifas.",
      emailLabel: "Correo",
      email: CONTACT_EMAIL,
      note: "Este sitio no envía formularios ni mensajes automáticos: al escribirnos abres un correo en tu propio cliente.",
      noFormTitle: "Por qué no hay formulario",
      noForm: "Preferimos no simular un alta que no podamos atender de verdad. Un correo directo llega igual y no guarda tus datos en ningún sitio.",
    },
    footer: {
      note: "FORNEXA · plataforma de orquestación logística. Contenido descriptivo; no constituye oferta ni compromiso de servicio.",
      memorandum: "Memorándum",
      tracking: "Tracking",
      login: "Acceso",
    },
  },

  en: {
    tagline: "Logistics orchestration",
    nav: {
      platform: "Platform",
      capabilities: "Capabilities",
      modules: "Modules",
      contact: "Contact",
      tracking: "Tracking",
    },
    login: "Sign in",
    language: "Language",
    hero: {
      title: "One platform; total control",
      rotatingLabel: "FORNEXA",
      lead: "Orders, shipments, trips, transport documents, customs, warehouse, tariffs and tracking on a single data model, isolated per organisation.",
      platformCta: "See the platform",
      trackingCta: "Track a shipment",
      accessKicker: "FORNEXA ACCESS",
      access: "Go to secure access",
      accessNote: "FORNEXA access is available only through the secure authentication portal.",
    },
    what: {
      eyebrow: "What it is",
      title: "One model, the whole operation",
      body: "FORNEXA orchestrates the logistics operation end to end: from the order and the shipment to the trip that moves it, the document that accompanies it and the event that closes it. Each domain keeps its identity — a shipment is not a trip — and anything external adapts to that model instead of being duplicated.",
    },
    capabilities: {
      eyebrow: "Capabilities",
      title: "What the platform solves",
      lead: "Four axes covering the full cycle, from order to documented delivery.",
      items: [
        {
          title: "Planning",
          summary: "Turn demand into executable trips, with their stops, windows and resources.",
          items: [
            "Orders, shipments and trips with explicit cardinality",
            "Stops with real sequence, window and status",
            "Dock appointments and availability per warehouse",
            "Service calendar and exceptions per address",
          ],
        },
        {
          title: "Collaboration",
          summary: "Work with customers, carriers and shippers without taking them out of the model.",
          items: [
            "Customers, partners and carrier profiles",
            "Quotes and tariffs per customer and service",
            "Dock booking with temporary, revocable access",
            "Blocks and carrier qualification",
          ],
        },
        {
          title: "Execution",
          summary: "Record what happens on the road, at customs and in the warehouse.",
          items: [
            "Transport document and proof of delivery with signature and evidence",
            "Transport events and per-stop timeline",
            "Warehouse: locations, inventory and movements",
            "Public tracking by reference, without a session",
          ],
        },
        {
          title: "Cost and compliance",
          summary: "Calculate the price and sustain the documentary file of the operation.",
          items: [
            "Tariff engine and traceable price calculation",
            "Customs case file and regulatory documents",
            "Dangerous goods assessment (ADR)",
            "Reports derived from events, not invented fields",
          ],
        },
      ],
    },
    advantages: {
      eyebrow: "Advantages",
      title: "Why it is built this way",
      items: [
        {
          title: "End-to-end traceability",
          summary:
            "From an EAN, SKU, batch or serial number to its trips, warehouse movements, documents and who read or moved them.",
        },
        {
          title: "Real-time operation",
          summary:
            "Control Tower and per-stop statuses fed by events, so you see the operation as it happens rather than the next day.",
        },
        {
          title: "Canonical model",
          summary:
            "Each domain has a single source of truth. Anything arriving from outside adapts to the model; plates, drivers and tariffs are not copied into other documents.",
        },
        {
          title: "Isolation per organisation",
          summary:
            "Every query is filtered by organisation and the database enforces row-level security, so one operation cannot see another.",
        },
      ],
    },
    modules: {
      eyebrow: "Modules",
      title: "One module per domain",
      lead: "Each area of the operation has its own screen, with the same visual language and the same logic.",
      note: "Details of each module, and its real status, are on the platform page.",
    },
    surfaces: {
      eyebrow: "Public surfaces",
      title: "What can be used without a session",
      lead: "Scoped, token-based access points, meant for third parties who are not platform users.",
      tokenNote: "Access with a key or token provided by the operator.",
      items: [
        {
          label: "Tracking",
          href: "/tracking",
          summary: "Follow a shipment by its reference, with check-digit warning.",
        },
        {
          label: "Transport document",
         
          summary: "Scoped lookup of a document by its access key, revocable and with expiry.",
        },
        {
          label: "Regulatory documents",
         
          summary: "Token-based access to a specific documentary file.",
        },
        {
          label: "Memorandum",
          href: "/memorandum",
          summary: "Public record of what the platform adds and what remains pending.",
        },
      ],
    },
    status: {
      eyebrow: "Real status",
      title: "What is ready and what is not",
      lead: "We would rather say it here than leave it to a website's interpretation.",
      liveTitle: "Working",
      live: [
        "Deployed, navigable web application with per-domain modules.",
        "Isolation per organisation enforced in the database.",
        "Public surfaces with revocable, expiring tokens.",
        "Public memorandum with the status of each addition.",
      ],
      preparingTitle: "In preparation or unverified",
      preparing: [
        "Telematics and third-party integrations: configurable, with no active connectors.",
        "Customs authority connection: the file and documents are modelled; there is no live exchange.",
        "Legal validity of the signature and the electronic document: not verified or ruled upon.",
        "Real customer data: the platform is shown with test data.",
      ],
    },
    cta: {
      title: "Want to see it with your data?",
      body: "Tell us which operation you want to orchestrate and we will walk you through the full path, from order to documented delivery.",
      button: "Talk to FORNEXA",
    },
    contact: {
      eyebrow: "Contact",
      title: "Let's talk about your operation",
      body: "Write to us and we will reply with a proposed walkthrough based on your own processes: orders, shipments, trips, transport document, customs, warehouse and tariffs.",
      emailLabel: "Email",
      email: CONTACT_EMAIL,
      note: "This site sends no forms or automatic messages: writing to us opens an email in your own client.",
      noFormTitle: "Why there is no form",
      noForm: "We would rather not simulate a sign-up we cannot genuinely serve. A direct email reaches us just as well and stores your data nowhere.",
    },
    footer: {
      note: "FORNEXA · logistics orchestration platform. Descriptive content; it is neither an offer nor a service commitment.",
      memorandum: "Memorandum",
      tracking: "Tracking",
      login: "Access",
    },
  },

  fr: {
    tagline: "Orchestration logistique",
    nav: {
      platform: "Plateforme",
      capabilities: "Capacités",
      modules: "Modules",
      contact: "Contact",
      tracking: "Suivi",
    },
    login: "Se connecter",
    language: "Langue",
    hero: {
      title: "Une plateforme ; un contrôle total",
      rotatingLabel: "FORNEXA",
      lead: "Commandes, expéditions, voyages, document de transport, douane, entrepôt, tarifs et suivi sur un même modèle de données, isolé par organisation.",
      platformCta: "Voir la plateforme",
      trackingCta: "Suivre un envoi",
      accessKicker: "FORNEXA ACCESS",
      access: "Accéder au portail sécurisé",
      accessNote:
        "L’accès à FORNEXA s’effectue uniquement via le portail d’authentification sécurisé.",
    },
    what: {
      eyebrow: "Qu’est-ce que c’est",
      title: "Un seul modèle, toute l’opération",
      body: "FORNEXA orchestre l’opération logistique de bout en bout : de la commande et l’expédition jusqu’au voyage qui la déplace, le document qui l’accompagne et l’événement qui la clôture. Chaque domaine garde son identité — une expédition n’est pas un voyage — et ce qui vient de l’extérieur s’adapte à ce modèle au lieu d’être dupliqué.",
    },
    capabilities: {
      eyebrow: "Capacités",
      title: "Ce que la plateforme résout",
      lead: "Quatre axes couvrant le cycle complet, de la commande à la livraison documentée.",
      items: [
        {
          title: "Planification",
          summary:
            "Transformer la demande en voyages exécutables, avec leurs arrêts, créneaux et ressources.",
          items: [
            "Commandes, expéditions et voyages à cardinalité explicite",
            "Arrêts avec séquence, créneau et statut réels",
            "Rendez-vous à quai et disponibilité par entrepôt",
            "Calendrier de service et exceptions par adresse",
          ],
        },
        {
          title: "Collaboration",
          summary:
            "Travailler avec clients, transporteurs et chargeurs sans les sortir du modèle.",
          items: [
            "Clients, partenaires et profils de transporteur",
            "Offres et tarifs par client et service",
            "Réservation de quai à accès temporaire révocable",
            "Blocages et homologation des partenaires",
          ],
        },
        {
          title: "Exécution",
          summary: "Enregistrer ce qui se passe sur la route, à la douane et à l’entrepôt.",
          items: [
            "Document de transport et preuve de livraison avec signature et preuve",
            "Événements de transport et chronologie par arrêt",
            "Entrepôt : emplacements, stock et mouvements",
            "Suivi public par référence, sans session",
          ],
        },
        {
          title: "Coût et conformité",
          summary: "Calculer le prix et tenir le dossier documentaire de l’opération.",
          items: [
            "Moteur de tarifs et calcul de prix traçable",
            "Dossier douanier et documents réglementaires",
            "Évaluation des marchandises dangereuses (ADR)",
            "Rapports issus des événements, non de champs inventés",
          ],
        },
      ],
    },
    advantages: {
      eyebrow: "Avantages",
      title: "Pourquoi c’est construit ainsi",
      items: [
        {
          title: "Traçabilité de bout en bout",
          summary:
            "D’un EAN, SKU, lot ou numéro de série jusqu’à ses voyages, mouvements d’entrepôt, documents et à qui les a lus ou déplacés.",
        },
        {
          title: "Opération en temps réel",
          summary:
            "Control Tower et statuts par arrêt alimentés par des événements, pour voir l’opération pendant qu’elle se produit.",
        },
        {
          title: "Modèle canonique",
          summary:
            "Chaque domaine a une source de vérité unique. Ce qui vient de l’extérieur s’adapte au modèle ; les plaques, conducteurs et tarifs ne sont pas recopiés ailleurs.",
        },
        {
          title: "Isolation par organisation",
          summary:
            "Chaque requête est filtrée par organisation et la base applique une sécurité au niveau des lignes.",
        },
      ],
    },
    modules: {
      eyebrow: "Modules",
      title: "Un module par domaine",
      lead: "Chaque domaine de l’opération a son propre écran, avec le même langage visuel et la même logique.",
      note: "Le détail de chaque module, et son état réel, se trouve sur la page plateforme.",
    },
    surfaces: {
      eyebrow: "Surfaces publiques",
      title: "Ce qui s’utilise sans session",
      lead: "Des accès délimités et à jeton, destinés à des tiers qui ne sont pas utilisateurs de la plateforme.",
      tokenNote: "Accès avec une clé ou un jeton fourni par l’opérateur.",
      items: [
        {
          label: "Suivi",
          href: "/tracking",
          summary: "Suivi d’un envoi par sa référence, avec avertissement de clé de contrôle.",
        },
        {
          label: "Document de transport",
         
          summary: "Consultation délimitée d’un document par sa clé d’accès, révocable et avec expiration.",
        },
        {
          label: "Documents réglementaires",
         
          summary: "Accès par jeton à un dossier documentaire précis.",
        },
        {
          label: "Mémorandum",
          href: "/memorandum",
          summary: "Registre public de ce que la plateforme ajoute et de ce qui reste en attente.",
        },
      ],
    },
    status: {
      eyebrow: "État réel",
      title: "Ce qui est prêt et ce qui ne l’est pas",
      lead: "Nous préférons le dire ici plutôt que de le laisser à l’interprétation d’un site.",
      liveTitle: "En fonctionnement",
      live: [
        "Application web déployée et navigable, avec des modules par domaine.",
        "Isolation par organisation appliquée dans la base de données.",
        "Surfaces publiques à jeton révocable et avec expiration.",
        "Mémorandum public avec l’état de chaque ajout.",
      ],
      preparingTitle: "En préparation ou non vérifié",
      preparing: [
        "Intégrations télématiques et tierces : configurables, sans connecteurs actifs.",
        "Connexion à l’administration douanière : le dossier et les documents sont modélisés ; pas d’échange réel.",
        "Validité juridique de la signature et du document électronique : non vérifiée ni statuée.",
        "Données client réelles : la plateforme est montrée avec des données de test.",
      ],
    },
    cta: {
      title: "Envie de le voir avec vos données ?",
      body: "Dites-nous quelle opération vous voulez orchestrer et nous vous montrerons le parcours complet, de la commande à la livraison documentée.",
      button: "Parler à FORNEXA",
    },
    contact: {
      eyebrow: "Contact",
      title: "Parlons de votre opération",
      body: "Écrivez-nous et nous répondrons avec une proposition de parcours basée sur vos propres processus : commandes, expéditions, voyages, document de transport, douane, entrepôt et tarifs.",
      emailLabel: "E-mail",
      email: CONTACT_EMAIL,
      note: "Ce site n’envoie ni formulaires ni messages automatiques : nous écrire ouvre un e-mail dans votre propre client.",
      noFormTitle: "Pourquoi pas de formulaire",
      noForm: "Nous préférons ne pas simuler une inscription que nous ne pourrions pas réellement traiter. Un e-mail direct nous parvient aussi bien et ne stocke vos données nulle part.",
    },
    footer: {
      note: "FORNEXA · plateforme d’orchestration logistique. Contenu descriptif ; ni offre ni engagement de service.",
      memorandum: "Mémorandum",
      tracking: "Suivi",
      login: "Accès",
    },
  },
};
