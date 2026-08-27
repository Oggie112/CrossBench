import TopFiveLeaderboard from "@/app/components/TopFiveLeaderboard";
import OptionsActivityList from "@/app/components/OptionsActivityList";

export default function Home() {
  return (
    <main className="p-8 flex flex-col gap-12">
      <TopFiveLeaderboard />
      <OptionsActivityList />
    </main>
  );
}
