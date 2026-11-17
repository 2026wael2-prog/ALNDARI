import { supabase } from '../../../lib/supabaseClient';
import type { PartyFormData } from '../types';

/** Checks for duplicate name, phone, and tax number, returning sanitized party fields. */
export async function validateAndSanitizePartyData(
  companyId: string,
  data: PartyFormData,
  id?: string
): Promise<PartyFormData> {
  const trimmedName = (data.name || '').trim();
  if (!trimmedName) throw new Error('الاسم مطلوب');

  const trimmedPhone = (data.phone || '').trim();
  const trimmedTaxNumber = (data.tax_number || '').trim();
  const partyType = data.type || 'customer';
  const typeLabel =
    partyType === 'customer' ? 'العميل' : partyType === 'employee' ? 'الموظف' : 'المورد';
  const relevantTypes = [partyType, 'both'];

  let nameQuery = supabase
    .from('parties')
    .select('id, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('type', relevantTypes)
    .ilike('name', trimmedName)
    .limit(1);
  if (id) nameQuery = nameQuery.neq('id', id);

  const { data: duplicateName } = await nameQuery;
  if (duplicateName && duplicateName.length > 0) {
    throw new Error(`يوجد ${typeLabel} مسجل مسبقاً بنفس الاسم: "${trimmedName}"`);
  }

  if (trimmedPhone) {
    let phoneQuery = supabase
      .from('parties')
      .select('id, name, phone')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('type', relevantTypes)
      .eq('phone', trimmedPhone)
      .limit(1);
    if (id) phoneQuery = phoneQuery.neq('id', id);

    const { data: duplicatePhone } = await phoneQuery;
    if (duplicatePhone && duplicatePhone.length > 0) {
      throw new Error(
        `رقم الهاتف (${trimmedPhone}) مسجل مسبقاً لـ ${typeLabel}: "${duplicatePhone[0].name}"`
      );
    }
  }

  if (trimmedTaxNumber) {
    let taxQuery = supabase
      .from('parties')
      .select('id, name, tax_number')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('tax_number', trimmedTaxNumber)
      .limit(1);
    if (id) taxQuery = taxQuery.neq('id', id);

    const { data: duplicateTax } = await taxQuery;
    if (duplicateTax && duplicateTax.length > 0) {
      throw new Error(
        `الرقم الضريبي (${trimmedTaxNumber}) مسجل مسبقاً للطرف: "${duplicateTax[0].name}"`
      );
    }
  }

  const sanitizedData: PartyFormData = {
    name: trimmedName,
    type: partyType,
    status: data.status || 'active',
  };
  if (trimmedPhone) sanitizedData.phone = trimmedPhone;
  if (trimmedTaxNumber) sanitizedData.tax_number = trimmedTaxNumber;
  if (data.email?.trim()) sanitizedData.email = data.email.trim();
  if (data.address?.trim()) sanitizedData.address = data.address.trim();
  if (data.category_id) sanitizedData.category_id = data.category_id;
  if (data.category) sanitizedData.category = data.category;

  return sanitizedData;
}
