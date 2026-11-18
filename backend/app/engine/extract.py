"""Pull plain text out of an uploaded .txt, .md, .docx or .pdf file."""
import io

MAX_BYTES = 5 * 1024 * 1024


def extract_text(filename: str, data: bytes) -> str:
    if len(data) > MAX_BYTES:
        raise ValueError("The file is larger than 5 MB.")
    name = (filename or "").lower()
    # Trust the content, not the name: a renamed file gets a clear message instead of a crash.
    if name.endswith(".pdf") and not data.lstrip()[:5].startswith(b"%PDF"):
        raise ValueError("This file is named .pdf but is not a PDF. Save it as a PDF again, or paste the text.")
    if name.endswith(".docx") and not data.startswith(b"PK"):
        raise ValueError("This file is named .docx but is not a Word document. Save it from Word again, or paste the text.")
    if not data.strip():
        raise ValueError("The file is empty.")
    if name.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="replace").strip()
    if name.endswith(".docx"):
        import docx

        doc = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip()).strip()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages).strip()
        if not text:
            raise ValueError("No text could be read from this PDF. Scanned PDFs are not supported yet.")
        return text
    raise ValueError("Unsupported file type. Use .txt, .md, .docx or .pdf.")
