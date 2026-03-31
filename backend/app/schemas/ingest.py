from pydantic import BaseModel


class IngestPDFResponse(BaseModel):
    inserted_rows: int
    tables_extracted: int = 0
    detected_currency: str
    company: str
    source_file: str


class IngestImageResponse(BaseModel):
    file_type: str
    company: str
    source_file: str
    extracted_items: int
