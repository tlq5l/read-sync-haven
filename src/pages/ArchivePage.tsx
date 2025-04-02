import type React from "react";

const ArchivePage: React.FC = () => {
	return (
		<div className="p-4">
			<h1 className="text-2xl font-bold mb-4">Archive</h1>
			<p>Archived articles will be displayed here.</p>
			{/* TODO: Implement article list filtering for Archive */}
		</div>
	);
};

export default ArchivePage;
