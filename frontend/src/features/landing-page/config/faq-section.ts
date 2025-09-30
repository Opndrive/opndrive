export const faqData = [
  {
    question: 'What is Opndrive and how is it different from other cloud storage services?',
    answer:
      'Opndrive is an open-source, modern web UI for Amazon S3 and S3-compatible storage services. Unlike traditional cloud storage, you connect your own AWS S3 bucket - your data stays in YOUR S3 bucket, not ours. It provides a Google Drive-like interface for managing your own S3 storage with complete control over your data.',
  },
  {
    question: 'How do I connect my AWS S3 bucket to Opndrive?',
    answer:
      "Visit the Connect page (/connect) and provide your AWS credentials: Access Key ID, Secret Access Key, Bucket Name, AWS Region, and optionally a Prefix. Your credentials are stored locally in your browser and never sent to our servers. You'll also need to configure CORS policy on your S3 bucket for browser access.",
  },
  {
    question: 'What AWS S3 permissions does Opndrive require?',
    answer:
      'Opndrive requires these S3 permissions: s3:GetObject (to download files), s3:PutObject (to upload files), s3:DeleteObject (to delete files), and s3:ListBucket (to browse folders). These permissions allow full file management capabilities within your S3 bucket.',
  },
  {
    question: 'What file types can I preview in Opndrive?',
    answer:
      'Opndrive supports previewing images (JPG, PNG, GIF, WebP, SVG, etc.), videos (MP4, WebM, MOV, etc.), audio files (MP3, WAV, FLAC, etc.), PDFs, Excel/CSV files, and code files (JavaScript, Python, JSON, etc.). Preview size limits vary by type: images up to 25MB, videos up to 100MB, PDFs up to 50MB, and code files up to 5MB.',
  },
  {
    question: 'How does file uploading work in Opndrive?',
    answer:
      'Opndrive supports multiple upload methods: Direct Upload using signed URLs for small files, Multipart Upload for large files (split into 5MB chunks), and Multipart Concurrent Upload for fastest performance. The system automatically selects the best method based on file size, or you can manually choose in Settings. Uploads happen directly from your browser to S3.',
  },
  {
    question: 'Is my data secure with Opndrive?',
    answer:
      "Yes, your data is completely secure. Your credentials are stored only in your browser's local storage and never sent to Opndrive servers. All file operations happen directly between your browser and your S3 bucket. Opndrive developers never have access to your files, credentials, or metadata.",
  },
  {
    question: 'Can I upload folders and maintain folder structure?',
    answer:
      'Yes, Opndrive supports folder uploads while preserving the complete folder structure. It processes all files within folders and subfolders, maintaining the hierarchy in your S3 bucket. You can also create new folders directly in the interface.',
  },
  {
    question: 'What happens if I lose internet connection during a large file upload?',
    answer:
      "Opndrive's multipart upload system provides resilience for large file uploads. The system splits files into chunks and can resume interrupted uploads. Upload state is saved in your browser's local storage, allowing recovery from unexpected disconnections.",
  },
  {
    question: 'How do I run Opndrive locally?',
    answer:
      "Clone the repository from GitHub, install dependencies with 'pnpm install', then 'cd frontend && pnpm install'. Start the development server with 'pnpm dev' in the frontend folder. Opndrive will be available at http://localhost:3000. You can also run it using Docker with the provided Docker image.",
  },
  {
    question: 'Does Opndrive work with S3-compatible services other than AWS?',
    answer:
      'Yes, Opndrive works with any S3-compatible storage service including MinIO, DigitalOcean Spaces, and other providers. You just need to provide the appropriate credentials and endpoint configuration for your S3-compatible service.',
  },
  {
    question: 'Can I search for files and folders in my S3 bucket?',
    answer:
      'Yes, Opndrive includes search functionality that allows you to search for files and folders within your S3 bucket. The search works across file and folder names within the specified prefix or current directory.',
  },
  {
    question: 'How are my preferences and settings stored?',
    answer:
      'Your settings (like preferred upload method, theme preferences, etc.) are stored locally in your browser using localStorage. These settings persist across sessions but are specific to each browser and device. Settings include upload method preferences, privacy controls, and general application preferences.',
  },
];
