import ProductCatalog from "@/app/dashboard/articulos/ProductCatalog";
import { PREVIEW_DEMO_CATALOG } from "@/lib/preview-demo-catalog";

export default function DemoProductsPage() {
  return <ProductCatalog initialDemoCatalog={PREVIEW_DEMO_CATALOG} />;
}
