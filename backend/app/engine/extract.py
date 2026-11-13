"""Pull plain text out of an uploaded .txt, .md, .docx or .pdf file."""
import io

MAX_BYTES = 5 * 1024 * 1024


def extract_text(filename: str, data: bytes) -> str:
    if len(data) > MAX_BYTES:
        raise ValueError("The file is larger than 5 MB.")
    name = (filename or "").lower()
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
