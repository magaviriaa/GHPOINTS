import { ImportFormsForm, ImportMembersForm } from "@/components/admin/import-form";
import { SectionHeader } from "@/components/ui-blocks";

export default function AdminImportsPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        title="Importaciones"
        description="Primero ves la vista previa; nada entra a la base hasta que confirmas."
      />

      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-display font-bold">Integrantes desde CSV o XLSX</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Columnas obligatorias: Nombre, Correo. Opcionales: Tipo, Comités. Cualquier otra
          columna, o una obligatoria que falte, rechaza el archivo completo.
        </p>
        <ImportMembersForm />
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-display font-bold">Histórico de Microsoft Forms</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Columnas: correo y actividad (nombre, publicId o id). La fecha es opcional. Los
          duplicados se omiten. También existe{" "}
          <code className="font-mono text-xs">POST /api/import/forms</code> con{" "}
          <code className="font-mono text-xs">Authorization: Bearer IMPORT_SECRET</code>.
        </p>
        <ImportFormsForm />
      </section>
    </div>
  );
}
