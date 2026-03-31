import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Upload, FileText, Database, Sparkles, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useData } from "../contexts/data-context";
import { parseFile } from "../utils/file-parser";

export function Welcome() {
  const navigate = useNavigate();
  const { setData } = useData();
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setError(null);
    setIsProcessing(true);

    const result = await parseFile(file);

    if (result.success) {
      setData({
        fileName: file.name,
        sheets: result.sheets,
        uploadDate: new Date(),
      });
      setIsProcessing(false);
    } else {
      setError(result.error || "Failed to process the file.");
      setIsProcessing(false);
    }
  };

  const handleContinue = () => {
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            
            <span className="text-3xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent" style={{ fontFamily: 'Poppins, sans-serif', letterSpacing: '-0.04em', fontWeight: '800' }}>
              Asklytics
            </span>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* Welcome Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">Account Created Successfully</span>
          </div>
          <h1 className="text-5xl font-bold mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Welcome to <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Asklytics</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Your AI-powered business intelligence assistant that transforms natural language into actionable insights.
          </p>
        </div>

        {/* How It Works */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold mb-2">1. Upload Your Data</h3>
            <p className="text-muted-foreground text-sm">
              Upload CSV, Excel, or other data files to get started with analysis.
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-secondary" />
            </div>
            <h3 className="font-semibold mb-2">2. Ask Questions</h3>
            <p className="text-muted-foreground text-sm">
              Type questions in plain English - no SQL knowledge required.
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-accent" />
            </div>
            <h3 className="font-semibold mb-2">3. Get Insights</h3>
            <p className="text-muted-foreground text-sm">
              Receive instant SQL queries, data tables, and beautiful visualizations.
            </p>
          </div>
        </div>

        {/* File Upload Section */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-lg">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">Upload Your First Dataset</h2>
            <p className="text-muted-foreground">
              Drag and drop your file or click to browse. We support CSV, Excel, JSON, and more.
            </p>
          </div>

          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
              dragActive
                ? "border-primary bg-primary/5 scale-[1.02]"
                : uploadedFile
                ? "border-secondary bg-secondary/5"
                : "border-border bg-muted/30 hover:border-primary/50 hover:bg-primary/5"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleChange}
              accept=".csv,.xlsx,.xls,.json,.txt,.pdf"
            />
            
            {uploadedFile ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center">
                  <FileText className="w-8 h-8 text-secondary" />
                </div>
                <div>
                  <p className="font-semibold text-lg text-foreground">{uploadedFile.name}</p>
                  <p className="text-muted-foreground">
                    {(uploadedFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <button
                  onClick={() => setUploadedFile(null)}
                  className="text-destructive hover:underline text-sm"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-lg text-foreground mb-1">
                      Drop your file here or click to browse
                    </p>
                    <p className="text-muted-foreground text-sm">
                      Supports CSV, Excel, JSON (Max 50MB)
                    </p>
                  </div>
                </div>
              </label>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={handleContinue}
              disabled={isProcessing}
              className="px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-lg flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? "Processing..." : uploadedFile ? "Continue with File" : "Skip for Now"}
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-destructive text-sm text-center">{error}</p>
            </div>
          )}

          <p className="text-center text-muted-foreground text-sm mt-6">
            You can always upload files later from the dashboard or chat interface.
          </p>
        </div>

        {/* Info Cards */}
        <div className="grid md:grid-cols-2 gap-6 mt-12">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-6">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Secure & Private
            </h3>
            <p className="text-muted-foreground text-sm">
              Your data is encrypted and stored securely. We never share your information with third parties.
            </p>
          </div>

          <div className="bg-gradient-to-br from-secondary/10 to-secondary/5 border border-secondary/20 rounded-2xl p-6">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-secondary" />
              AI-Powered Analysis
            </h3>
            <p className="text-muted-foreground text-sm">
              Our advanced AI understands complex queries and generates optimized SQL automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}