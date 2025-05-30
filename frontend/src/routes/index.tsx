import { createFileRoute, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: App,
});

function App() {
	const router = useRouter();

	return (
		<div className="flex flex-1 w-full h-full">
			<ImageCard
				title="Scenario Editor"
				description="Create custom military scenarios by positioning units, buildings, and marking strategic areas."
				imageSrc="/images/scenario-editor.jpg"
				onClick={() => router.navigate({ to: "/editor" })}
			/>
			<ImageCard
				title="Load Scenario"
				description="Pick a scenario and play against another player in a simulated environment."
				imageSrc="/images/load-scenario.jpg"
				onClick={() => router.navigate({ to: "/load-scenario" })}
			/>
		</div>
	);
}

type ImageCardProps = {
	title: string,
	description: string,
	imageSrc: string,
	onClick: ()=> void,
};
function ImageCard({ title, description, imageSrc, onClick }: ImageCardProps) {
	return (
		<div
			className="relative group cursor-pointer overflow-hidden w-1/2 aspect-video h-full"
			onClick={onClick}
			role="button"
			aria-label={title}
		>
			<img
				src={imageSrc}
				alt={title}
				className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
			/>
			<div className="absolute inset-0 bg-gradient-to-b from-black/60 to-black/30 flex flex-col items-center justify-center text-center px-4 transition duration-300 group-hover:backdrop-blur-sm">
				<h2 className="text-white text-2xl md:text-5xl font-extrabold drop-shadow-lg">
					{title}
				</h2>
				<p className="text-white text-sm md:text-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition duration-300 mt-2 max-w-md">
					{description}
				</p>
			</div>
		</div>
	);
}
