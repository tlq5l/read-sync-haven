import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, FileText, Upload, X } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";

interface FileUploadProps {
	onFileSelect: (file: File) => void;
	isUploading?: boolean;
	accept?: string;
	maxSize?: number; // in bytes
}

export default function FileUpload({
	onFileSelect,
	isUploading = false,
	accept = ".epub",
	maxSize = 50 * 1024 * 1024, // 50MB default
}: FileUploadProps) {
	const [isDragging, setIsDragging] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	};

	const validateFile = (file: File): boolean => {
		setError(null);

		// Check file size
		if (file.size > maxSize) {
			setError(
				`File is too large. Maximum size is ${Math.round(
					maxSize / (1024 * 1024),
				)}MB.`,
			);
			return false;
		}

		// Check file type based on extension
		const fileExt = file.name.split(".").pop()?.toLowerCase();
		const acceptedExtensions = accept.split(",").map(ext => ext.trim().replace(".", ""));
		
		if (!acceptedExtensions.includes(fileExt || "")) {
			setError(`Only ${accept} files are supported.`);
			return false;
		}

		return true;
	};

	const handleFileDrop = (e: React.DragEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			const file = e.dataTransfer.files[0];

			if (validateFile(file)) {
				setSelectedFile(file);
				onFileSelect(file);
			}
		}
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			const file = e.target.files[0];

			if (validateFile(file)) {
				setSelectedFile(file);
				onFileSelect(file);
			}
		}
	};

	const handleButtonClick = () => {
		if (fileInputRef.current) {
			fileInputRef.current.click();
		}
	};

	const handleRemoveFile = () => {
		setSelectedFile(null);
		setError(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	// Create a formatted list of accepted file types for display
	const acceptedFileTypes = accept
		.split(",")
		.map(ext => ext.trim().toUpperCase().replace(".", ""))
		.join(", ");

	return (
		<div className="w-full">
			<input
				type="file"
				ref={fileInputRef}
				onChange={handleFileSelect}
				accept={accept}
				className="hidden"
				disabled={isUploading}
			/>

			{!selectedFile ? (
				<button
					className={cn(
						"border-4 border-dashed rounded-lg p-6 transition-colors flex flex-col items-center justify-center gap-4 cursor-pointer w-full",
						isDragging
							? "border-bondwise-400 bg-bondwise-50"
							: "border-gray-200 hover:border-bondwise-200 hover:bg-gray-50",
					)}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleFileDrop}
					onClick={handleButtonClick}
					aria-label={`Upload ${acceptedFileTypes} file`}
					style={{ minHeight: "200px" }}
					type="button"
				>
					<div className="rounded-full bg-gray-100 p-3">
						<Upload className="h-6 w-6 text-gray-500" />
					</div>
					<div className="text-center">
						<p className="text-sm font-medium">
							Drag and drop your {acceptedFileTypes} file here
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							or click to browse files
						</p>
					</div>
					<p className="text-xs text-muted-foreground">
						Maximum file size: {Math.round(maxSize / (1024 * 1024))}MB
					</p>
				</button>
			) : (
				<div className="border rounded-lg p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center space-x-3">
							<div className="rounded-full bg-blue-50 p-2">
								<FileText className="h-5 w-5 text-bondwise-500" />
							</div>
							<div>
								<p className="text-sm font-medium truncate max-w-[200px] sm:max-w-md">
									{selectedFile.name}
								</p>
								<p className="text-xs text-muted-foreground">
									{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
								</p>
							</div>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleRemoveFile}
							disabled={isUploading}
							className="text-gray-500 hover:text-red-500"
						>
							<X className="h-4 w-4" />
						</Button>
					</div>
				</div>
			)}

			{error && (
				<Alert variant="destructive" className="mt-3">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
		</div>
	);
}
