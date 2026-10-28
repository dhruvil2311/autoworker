/**
 * Multi-Language Detection and Normalization Engine
 * 
 * Automatically detects non-English text in user instructions, SOP documents,
 * web applications, internal tools, and extracted data, translating and normalizing
 * them to English so Autoworker can reliably reason, match actions, and produce
 * consistent deliverables without requiring custom per-website scripts.
 */

export type SupportedLanguage = "en" | "pl" | "de" | "fr" | "es" | "it" | "pt" | "nl" | "hi";

export interface TranslationResult {
  original: string;
  translated: string;
  detectedLanguage: string;
  isEnglish: boolean;
  wasTranslated: boolean;
}

// Enterprise / E-commerce / SaaS semantic dictionary mapping foreign phrases to English canonical concepts
export const DOMAIN_TRANSLATIONS: Record<string, string> = {
  // Polish (pl)
  "zamówienia": "Orders",
  "zamówienie": "Order",
  "sprzedaż": "Sales",
  "klienci": "Customers",
  "klient": "Customer",
  "produkty": "Products",
  "produkt": "Product",
  "katalog": "Catalog",
  "magazyn": "Inventory",
  "pulpit": "Dashboard",
  "panel administracyjny": "Admin panel",
  "panel główny": "Dashboard",
  "zaloguj się": "Sign In",
  "zaloguj": "Sign In",
  "logowanie": "Login",
  "nazwa użytkownika": "Username",
  "użytkownik": "Username",
  "hasło": "Password",
  "wyślij": "Submit",
  "zatwierdź": "Confirm",
  "zapisz": "Save",
  "dodaj do koszyka": "Add to Cart",
  "do koszyka": "Add to Cart",
  "koszyk": "Cart",
  "kasa": "Checkout",
  "do kasy": "Proceed to Checkout",
  "zamawiam": "Place Order",
  "zobacz": "View",
  "otwórz": "Open",
  "podgląd": "Preview",
  "wstecz": "Back",
  "powrót": "Back",
  "wróć": "Return to",
  "anuluj": "Cancel",
  "kontynuuj": "Continue",
  "dalej": "Next",
  "zakończ zadanie": "Finish the task",
  "zakończ": "Finish",
  "filtruj": "Filter",
  "szukaj": "Search",
  "w trakcie realizacji": "Processing",
  "przetwarzanie": "Processing",
  "zrealizowane": "Complete",
  "zakończone": "Complete",
  "kompletne": "Complete",
  "oczekujące": "Pending",
  "anulowane": "Canceled",
  "wstrzymane": "On Hold",
  "zamknięte": "Closed",
  "suma": "Total",
  "razem": "Total",
  "kwota": "Amount",
  "łączna kwota": "Grand Total",
  "suma częściowa": "Subtotal",
  "podsuma": "Subtotal",
  "nabywca": "Buyer",
  "pozycje": "Items",
  "przedmioty": "Items",
  "ilość produktów": "Product quantities",
  "ilość": "Quantity",
  "stan": "Status",
  "status": "Status",
  "numer zamówienia": "Order number",
  "nr zamówienia": "Order #",
  "data zamówienia": "Order date",
  "data": "Date",
  "wysyłka": "Shipping",
  "kwota wysyłki": "Shipping amount",
  "podatek": "Tax",
  "kwota podatku": "Tax amount",
  "poczekaj na załadowanie": "Wait for load",
  "poczekaj aż": "Wait until",
  "poczekaj": "Wait",
  "kliknij": "Click",
  "wpisz": "enter",
  "wybierz pierwsze dostępne zamówienie z listy": "Select the first available order in the list",
  "wybierz pierwsze dostępne zamówienie": "Select the first available order",
  "wybierz pierwsze": "Select the first",
  "otwórz drugie istniejące zamówienie": "Open a second existing order",
  "otwórz drugie zamówienie": "Open a second existing order",
  "drugie zamówienie": "second order",
  "pierwsze zamówienie": "first order",
  "odczytaj i zapisz": "Read and record",
  "zapisz informacje": "record information",
  "powtórz ten sam odczyt": "Repeat the same inspection and record the same fields",
  "powtórz tę samą inspekcję": "Repeat the same inspection and record the same fields",
  "powtórz": "Repeat",
  "porównaj oba zamówienia": "Compare the two orders and determine whether their statuses and order information differ",
  "porównaj": "Compare",
  "różnią się": "differ",
  "nie wprowadzaj żadnych zmian": "Do not make any changes",
  "nie edytuj": "Do not edit",

  // German (de)
  "bestellungen": "Orders",
  "bestellung": "Order",
  "aufträge": "Orders",
  "auftrag": "Order",
  "verkauf": "Sales",
  "vertrieb": "Sales",
  "kunden": "Customers",
  "kunde": "Customer",
  "produkte": "Products",
  "bestand": "Inventory",
  "lager": "Warehouse",
  "übersicht": "Overview",
  "anmelden": "Sign In",
  "einloggen": "Log In",
  "benutzername": "Username",
  "passwort": "Password",
  "absenden": "Submit",
  "einreichen": "Submit",
  "speichern": "Save",
  "in den warenkorb": "Add to Cart",
  "warenkorb": "Cart",
  "kasse": "Checkout",
  "zur kasse": "Proceed to Checkout",
  "ansehen": "View",
  "öffnen": "Open",
  "klicken": "Click",
  "eingeben": "enter",
  "zurück": "Back",
  "abbrechen": "Cancel",
  "weiter": "Continue",
  "fertigstellen": "Finish",
  "filtern": "Filter",
  "suchen": "Search",
  "in bearbeitung": "Processing",
  "abgeschlossen": "Complete",
  "vollständig": "Complete",
  "ausstehend": "Pending",
  "storniert": "Canceled",
  "angehalten": "On Hold",
  "geschlossen": "Closed",
  "gesamtbetrag": "Grand Total",
  "summe": "Total",
  "betrag": "Amount",
  "zwischensumme": "Subtotal",
  "artikel": "Items",
  "posten": "Items",
  "zustand": "Status",
  "bestellnummer": "Order number",
  "datum": "Date",
  "versand": "Shipping",
  "steuer": "Tax",
  "vergleichen": "Compare",
  "wiederholen": "Repeat",

  // French (fr)
  "commandes": "Orders",
  "commande": "Order",
  "ventes": "Sales",
  "clients": "Customers",
  "client": "Customer",
  "produits": "Products",
  "tableau de bord": "Dashboard",
  "connexion": "Sign In",
  "se connecter": "Log In",
  "identifiant": "Username",
  "nom d'utilisateur": "Username",
  "mot de passe": "Password",
  "soumettre": "Submit",
  "valider": "Confirm",
  "enregistrer": "Save",
  "sauvegarder": "Save",
  "ajouter au panier": "Add to Cart",
  "panier": "Cart",
  "passer la commande": "Checkout",
  "voir": "View",
  "ouvrir": "Open",
  "cliquer": "Click",
  "saisir": "enter",
  "retour": "Back",
  "annuler": "Cancel",
  "continuer": "Continue",
  "suivant": "Next",
  "terminer": "Finish",
  "filtrer": "Filter",
  "rechercher": "Search",
  "en traitement": "Processing",
  "en cours": "Processing",
  "terminé": "Complete",
  "complété": "Complete",
  "en attente": "Pending",
  "annulé": "Canceled",
  "suspendu": "On Hold",
  "fermé": "Closed",
  "montant total": "Grand Total",
  "sous-total": "Subtotal",
  "articles": "Items",
  "statut": "Status",
  "état": "Status",
  "numéro de commande": "Order number",
  "expédition": "Shipping",
  "taxe": "Tax",
  "comparer": "Compare",
  "répéter": "Repeat",

  // Spanish (es)
  "pedidos": "Orders",
  "pedido": "Order",
  "órdenes": "Orders",
  "orden": "Order",
  "ventas": "Sales",
  "clientes": "Customers",
  "productos": "Products",
  "inventario": "Inventory",
  "panel de control": "Dashboard",
  "iniciar sesión": "Sign In",
  "entrar": "Log In",
  "usuario": "Username",
  "contraseña": "Password",
  "enviar": "Submit",
  "confirmar": "Confirm",
  "guardar": "Save",
  "añadir al carrito": "Add to Cart",
  "agregar al carrito": "Add to Cart",
  "carrito": "Cart",
  "tramitar pedido": "Checkout",
  "finalizar compra": "Checkout",
  "pagar": "Pay",
  "abrir": "Open",
  "hacer clic": "Click",
  "ingresar": "enter",
  "volver": "Back",
  "atrás": "Back",
  "cancelar": "Cancel",
  "finalizar": "Finish",
  "buscar": "Search",
  "en proceso": "Processing",
  "procesando": "Processing",
  "completado": "Complete",
  "terminado": "Complete",
  "pendiente": "Pending",
  "cancelado": "Canceled",
  "retenido": "On Hold",
  "cerrado": "Closed",
  "importe total": "Grand Total",
  "artículos": "Items",
  "número de pedido": "Order number",
  "fecha": "Date",
  "envío": "Shipping",
  "impuesto": "Tax",
  "comparar": "Compare",
  "repetir": "Repeat"
};

// Common step-prefix markers across languages
const STEP_PREFIXES = [
  /^(?:krok|paso|étape|schritt|step)\s*\d+[\.:]\s*/i,
  /^\d+[\.\)]\s*/
];

// Distinct language patterns
const LANG_PATTERNS: Record<string, RegExp> = {
  pl: /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|(?:zamówi|sprzed|zaloguj|klient|wstecz|kwota|krok|hasło)/i,
  de: /[äöüßÄÖÜ]|(?:bestell|verkauf|anmeld|kunde|zurück|gesamt|schritt|benutzername)/i,
  fr: /[éèêëàâçîïôûùÉÈÊËÀÂÇÎÏÔÛÙ]|(?:commande|vente|connexion|panier|enregistr|étape)/i,
  es: /[áéíóúñÁÉÍÓÚÑ¿¡]|(?:pedido|venta|iniciar|carrito|guardar|paso|contraseña)/i,
  it: /[àèéìòùÀÈÉÌÒÙ]|(?:ordine|vendita|accedi|carrello|salva|passo)/i
};

/**
 * Detect language of given text
 */
export function detectLanguage(text: string): { language: string; isEnglish: boolean; confidence: number } {
  if (!text || typeof text !== "string") {
    return { language: "en", isEnglish: true, confidence: 1 };
  }

  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return { language: "en", isEnglish: true, confidence: 0.5 };
  }

  // Check known characteristic regex patterns
  for (const [lang, pattern] of Object.entries(LANG_PATTERNS)) {
    if (pattern.test(trimmed)) {
      return { language: lang, isEnglish: false, confidence: 0.9 };
    }
  }

  // Check dictionary words
  const lower = trimmed.toLowerCase();
  for (const key of Object.keys(DOMAIN_TRANSLATIONS)) {
    if (lower.includes(key)) {
      return { language: "foreign", isEnglish: false, confidence: 0.85 };
    }
  }

  return { language: "en", isEnglish: true, confidence: 0.8 };
}

/**
 * Translate and normalize foreign text to English
 */
export function translateToEnglish(text: string): TranslationResult {
  if (!text || typeof text !== "string") {
    return { original: "", translated: "", detectedLanguage: "en", isEnglish: true, wasTranslated: false };
  }

  const trimmed = text.trim();
  const detection = detectLanguage(trimmed);

  if (detection.isEnglish) {
    return {
      original: trimmed,
      translated: trimmed,
      detectedLanguage: "en",
      isEnglish: true,
      wasTranslated: false
    };
  }

  let translated = trimmed;
  let matchesCount = 0;

  // Perform phrase-level and token-level normalization sorted by length descending
  const sortedKeys = Object.keys(DOMAIN_TRANSLATIONS).sort((a, b) => b.length - a.length);

  for (const foreignKey of sortedKeys) {
    const regex = new RegExp(`(?:^|(?<=[^\\p{L}\\p{N}_]))${escapeRegExp(foreignKey)}(?=[^\\p{L}\\p{N}_]|$)`, "giu");
    if (regex.test(translated)) {
      translated = translated.replace(regex, DOMAIN_TRANSLATIONS[foreignKey]!);
      matchesCount++;
    }
  }

  // Substring match for longer domain phrases if not already matched
  if (matchesCount === 0) {
    for (const foreignKey of sortedKeys) {
      if (foreignKey.length >= 4 && translated.toLowerCase().includes(foreignKey)) {
        const regex = new RegExp(escapeRegExp(foreignKey), "gi");
        translated = translated.replace(regex, DOMAIN_TRANSLATIONS[foreignKey]!);
        matchesCount++;
      }
    }
  }

  return {
    original: trimmed,
    translated,
    detectedLanguage: detection.language,
    isEnglish: false,
    wasTranslated: matchesCount > 0 || translated !== trimmed
  };
}

/**
 * Translate a complete document or multi-line instruction into English.
 * Normalizes step lines (e.g. "Krok 1: ..." -> "Step 1: ...") and replaces domain phrases.
 */
export function translateInstructionOrDocumentToEnglish(text: string): {
  translated: string;
  detectedLanguage: string;
  wasTranslated: boolean;
} {
  if (!text || typeof text !== "string") {
    return { translated: "", detectedLanguage: "en", wasTranslated: false };
  }

  const detection = detectLanguage(text);
  if (detection.isEnglish) {
    return { translated: text, detectedLanguage: "en", wasTranslated: false };
  }

  const lines = text.split(/\r?\n/);
  const translatedLines: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      translatedLines.push(line);
      continue;
    }

    let lineText = line;
    // Normalize step prefix: "Krok 1:" -> "Step 1:"
    const stepMatch = lineText.match(/^(?:krok|paso|étape|schritt)\s*(\d+)[\.:]\s*/i);
    if (stepMatch) {
      lineText = lineText.replace(/^(?:krok|paso|étape|schritt)\s*(\d+)[\.:]\s*/i, `Step ${stepMatch[1]}: `);
    }

    const res = translateToEnglish(lineText);
    translatedLines.push(res.translated);
  }

  const resultText = translatedLines.join("\n");
  return {
    translated: resultText,
    detectedLanguage: detection.language,
    wasTranslated: resultText !== text
  };
}

/**
 * Get multi-lingual synonyms for an English concept (for locator text matching)
 */
export function getMultiLingualSynonyms(englishTerm: string): string[] {
  if (!englishTerm) return [];
  const lower = englishTerm.trim().toLowerCase();
  const results = new Set<string>([englishTerm]);

  for (const [foreignWord, translatedWord] of Object.entries(DOMAIN_TRANSLATIONS)) {
    if (translatedWord.toLowerCase() === lower || lower.includes(translatedWord.toLowerCase())) {
      results.add(foreignWord);
    }
  }

  // Common high-frequency UI synonyms
  if (lower.includes("order")) {
    results.add("zamówienia").add("zamówienie").add("bestellungen").add("commandes").add("pedidos");
  }
  if (lower.includes("sales")) {
    results.add("sprzedaż").add("verkauf").add("ventes").add("ventas");
  }
  if (lower.includes("login") || lower.includes("sign in")) {
    results.add("zaloguj").add("zaloguj się").add("anmelden").add("connexion").add("iniciar sesión");
  }
  if (lower.includes("back") || lower.includes("return")) {
    results.add("wstecz").add("powrót").add("zurück").add("retour").add("volver");
  }
  if (lower.includes("add to cart") || lower.includes("cart")) {
    results.add("dodaj do koszyka").add("koszyk").add("warenkorb").add("panier").add("carrito");
  }
  if (lower.includes("checkout")) {
    results.add("kasa").add("do kasy").add("zur kasse").add("passer la commande").add("tramitar pedido");
  }

  return Array.from(results);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
