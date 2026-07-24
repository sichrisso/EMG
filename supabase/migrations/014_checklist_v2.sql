-- =============================================================================
-- 014_checklist_v2.sql — run after 013.
-- The default application checklist, as specified: personal essay, statement
-- of purpose, English test result, transcripts, resume, degree, letter of
-- recommendation, financial documents. Applies to newly added universities;
-- existing checklists are left as the student arranged them.
-- =============================================================================

delete from public.application_material_defaults;

insert into public.application_material_defaults (name, description, degree_levels, sort_order) values
  ('Personal essay',           'Your story: who you are beyond grades.',                        '{bachelor,masters,phd,other}', 1),
  ('Statement of Purpose',     'Why this program, why this university, why you.',               '{bachelor,masters,phd,other}', 2),
  ('English test result',      'IELTS / TOEFL / Duolingo score report, per program rules.',     '{bachelor,masters,phd,other}', 3),
  ('Transcripts',              'Official academic records from all institutions attended.',     '{bachelor,masters,phd,other}', 4),
  ('Resume',                   'One to two pages of education, work, and achievements.',        '{bachelor,masters,phd,other}', 5),
  ('Degree',                   'Degree certificate or diploma (or expected graduation proof).', '{bachelor,masters,phd,other}', 6),
  ('Letter of Recommendation', 'From professors or supervisors who know your work.',            '{bachelor,masters,phd,other}', 7),
  ('Financial Documents',      'Bank statements or sponsor letters, per the university.',       '{bachelor,masters,phd,other}', 8)
on conflict do nothing;
