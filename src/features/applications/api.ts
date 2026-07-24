import { supabase } from '@/lib/supabase';
import { assertUpdated } from '@/lib/safeUpdate';
import type { Application, ApplicationDetail, AppStatus, DegreeLevel, MaterialStatus } from '@/types';

export async function getApplications(): Promise<Application[]> {
  const { data, error } = await supabase.from('applications').select('*')
    .order('deadline', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Application[];
}

export async function getApplicationDetail(id: string): Promise<ApplicationDetail | null> {
  const { data, error } = await supabase
    .from('applications')
    .select('*, materials:application_materials(*)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const raw = data as ApplicationDetail & { materials?: ApplicationDetail['materials'] };
  let materials = raw.materials ?? [];

  // Self-heal: older applications created before the checklist trigger existed
  // have no items. Seed them from the defaults on first open so the tracker is
  // never empty (the 006 migration does the same server-side in bulk).
  if (materials.length === 0) {
    const { data: defaults } = await supabase
      .from('application_material_defaults')
      .select('name, description, sort_order, degree_levels');
    const applicable = (defaults ?? []).filter(
      (d: { degree_levels: string[] }) => d.degree_levels.includes(raw.degree_level),
    );
    if (applicable.length > 0) {
      const { data: inserted } = await supabase
        .from('application_materials')
        .insert(applicable.map((d: { name: string; description: string; sort_order: number }) => ({
          application_id: id,
          name: d.name,
          description: d.description,
          sort_order: d.sort_order,
        })))
        .select('*');
      materials = (inserted ?? []) as ApplicationDetail['materials'];
    }
  }

  return { ...raw, materials: materials.sort((a, b) => a.sort_order - b.sort_order) };
}

export async function createApplication(menteeId: string, input: {
  university_name: string; country: string; program: string;
  degree_level: DegreeLevel; deadline?: string | null; notes?: string | null; portal_url?: string | null;
}): Promise<Application> {
  const { data, error } = await supabase.from('applications')
    .insert({ ...input, mentee_id: menteeId }).select().maybeSingle();
  if (error) throw error;
  return data as Application;
}

export async function updateApplication(id: string, input: Partial<{
  university_name: string; country: string; program: string; degree_level: DegreeLevel;
  deadline: string | null; status: AppStatus; notes: string | null; portal_url: string | null;
}>): Promise<void> {
  await assertUpdated(supabase.from('applications').update(input).eq('id', id).select('id'));
}

export async function deleteApplication(id: string): Promise<void> {
  await assertUpdated(supabase.from('applications').delete().eq('id', id).select('id'));
}

export async function updateMaterial(id: string, input: { status?: MaterialStatus; notes?: string | null }): Promise<void> {
  await assertUpdated(supabase.from('application_materials').update(input).eq('id', id).select('id'));
}

export async function addCustomMaterial(applicationId: string, name: string): Promise<void> {
  const { error } = await supabase.from('application_materials')
    .insert({ application_id: applicationId, name, is_custom: true, sort_order: 999 });
  if (error) throw error;
}

export async function deleteCustomMaterial(id: string): Promise<void> {
  await assertUpdated(
    supabase.from('application_materials')
      .delete().eq('id', id).eq('is_custom', true).select('id'),
  );
}

/**
 * Any checklist item can be removed, the defaults are a starting point, not
 * a cage. A student applying somewhere that wants no recommendation letters
 * should be able to drop that row.
 */
export async function removeMaterial(id: string): Promise<void> {
  await assertUpdated(
    supabase.from('application_materials').delete().eq('id', id).select('id'),
  );
}

/**
 * Attach a document to a checklist item. Files live in the private `documents`
 * bucket under {userId}/{applicationId}/, readable by the student, admins, and
 * any mentor with a live request from them, so a mentor asked to review an SOP
 * can actually open it.
 */
export async function uploadMaterialFile(
  material: { id: string; application_id: string },
  userId: string,
  file: File,
): Promise<void> {
  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${userId}/${material.application_id}/${material.id}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from('documents')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;

  await assertUpdated(
    supabase
      .from('application_materials')
      .update({
        file_url: path,
        file_name: file.name,
        uploaded_at: new Date().toISOString(),
        status: 'done',   // uploading the artifact IS the completion signal
      })
      .eq('id', material.id)
      .select('id'),
  );
}

/** Remove an attachment (and its file) but keep the checklist item. */
export async function removeMaterialFile(material: {
  id: string; file_url: string | null;
}): Promise<void> {
  if (material.file_url) {
    await supabase.storage.from('documents').remove([material.file_url]);
  }
  await assertUpdated(
    supabase
      .from('application_materials')
      .update({ file_url: null, file_name: null, uploaded_at: null, status: 'in_progress' })
      .eq('id', material.id)
      .select('id'),
  );
}

/** Private bucket: hand back a short-lived signed URL to view the document. */
export async function getMaterialFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
