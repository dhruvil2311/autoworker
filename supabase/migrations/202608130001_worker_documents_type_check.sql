-- The application layer was updated to accept PDF, DOCX, TXT, and IMAGE evidence
-- (in addition to the original CSV/SOP/EXCEL), but this table's CHECK constraint was
-- never updated to match — so every upload of one of the new types was rejected by
-- Postgres with "violates check constraint worker_documents_type_check", even though
-- the API had already validated and parsed the file successfully.

alter table worker_documents drop constraint worker_documents_type_check;

alter table worker_documents
  add constraint worker_documents_type_check
  check (type in ('CSV', 'SOP', 'EXCEL', 'PDF', 'DOCX', 'TXT', 'IMAGE'));
