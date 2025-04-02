import type React from "react";

const LaterPage: React.FC = () => {
	return (
		<div className="p-4">
			<h1 className="text-2xl font-bold mb-4">Later</h1>
			<p>Articles marked for later reading will be displayed here.</p>
			{/* TODO: Implement article list filtering for Later */}
		</div>
	);
};

export default LaterPage;
