import type { Catalog } from "../app/dashboard/articulos/ProductCatalog";

// Static, synthetic interface data. These identifiers never reference backend records.
export const PREVIEW_DEMO_CATALOG: Catalog = {
  items: [
    {
      id: "preview-demo-product-01", sku: "DEMO-CAJA-001", name: "Caja de muestra",
      description: "Artículo ficticio con pesos y dimensiones completos para revisar la ficha.", gtin: "0000000000000",
      ownerCustomerCode: "DEMO-C01", ownerCustomerName: "Cliente ficticio Aurora", uomBase: "UN",
      netWeightKg: 1.25, grossWeightKg: 1.5, lengthCm: 30, widthCm: 20, heightCm: 15, volumeM3: 0.009,
      hazardStatus: "UNKNOWN", status: "ACTIVE",
    },
    {
      id: "preview-demo-product-02", sku: "DEMO-TEXTO-LARGO-002",
      name: "Artículo ficticio de demostración con un nombre comercial extenso para comprobar la lectura, los saltos de línea y la distribución de las columnas en pantallas de distintos tamaños",
      description: "Esta descripción es completamente sintética y sirve para revisar cómo se presenta una ficha con texto largo. Incluye instrucciones ficticias de manipulación, referencias de muestra y observaciones de embalaje para comprobar que el contenido sigue siendo legible al buscar, consultar y editar el artículo. Todas las magnitudes de esta ficha tienen valor cero para distinguirlas de los campos sin informar.",
      gtin: "00000000000000", ownerCustomerCode: "DEMO-C02",
      ownerCustomerName: "Cliente ficticio Horizonte de Pruebas y Maquetas", uomBase: "KG",
      netWeightKg: 0, grossWeightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0, volumeM3: 0,
      hazardStatus: "UNKNOWN", status: "INACTIVE",
    },
    {
      id: "preview-demo-product-03", sku: "DEMO-SIN-MEDIDAS-003", name: "Muestra sin medidas",
      description: "Ficha ficticia con magnitudes sin informar y sin GTIN.", gtin: "",
      ownerCustomerCode: "DEMO-C01", ownerCustomerName: "Cliente ficticio Aurora", uomBase: "UN",
      netWeightKg: null, grossWeightKg: null, lengthCm: null, widthCm: null, heightCm: null, volumeM3: null,
      hazardStatus: "UNKNOWN", status: "ACTIVE",
    },
    {
      id: "preview-demo-product-04", sku: "DEMO-VOLUMEN-004", name: "Volumen de muestra",
      description: "Artículo ficticio para probar otra unidad base y una ficha con valores parciales.", gtin: "00000000",
      ownerCustomerCode: "DEMO-C02", ownerCustomerName: "Cliente ficticio Horizonte de Pruebas y Maquetas", uomBase: "M3",
      netWeightKg: 0, grossWeightKg: null, lengthCm: 100, widthCm: 100, heightCm: null, volumeM3: 1,
      hazardStatus: "UNKNOWN", status: "ACTIVE",
    },
  ],
  customers: [
    { code: "DEMO-C01", name: "Cliente ficticio Aurora", status: "ACTIVE" },
    { code: "DEMO-C02", name: "Cliente ficticio Horizonte de Pruebas y Maquetas", status: "ACTIVE" },
    { code: "DEMO-C03", name: "Cliente ficticio Archivo", status: "INACTIVE" },
  ],
  uoms: [
    { code: "UN", name: "Unidad", category: "COUNT" },
    { code: "KG", name: "Kilogramo", category: "MASS" },
    { code: "M3", name: "Metro cúbico", category: "VOLUME" },
  ],
  canEdit: true,
  truncated: false,
};
