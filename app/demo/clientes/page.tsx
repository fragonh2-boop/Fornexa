import CustomersListView from "../../dashboard/clientes/CustomersListView";
import { DEMO_CUSTOMERS } from "@/lib/preview-demo-master-lists";

export default async function DemoCustomersPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  return <CustomersListView customers={DEMO_CUSTOMERS} estado={estado} basePath="/demo" />;
}
