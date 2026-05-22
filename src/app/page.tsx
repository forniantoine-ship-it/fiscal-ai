import { HomeCta } from "@/components/marketing/HomeCta";
import { HomeFaq } from "@/components/marketing/HomeFaq";
import { HomeHero } from "@/components/marketing/HomeHero";
import { ReassuranceGrid } from "@/components/marketing/ReassuranceGrid";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <HomeHero />
        <ReassuranceGrid />
        <HomeFaq />
        <HomeCta />
      </main>
      <SiteFooter />
    </>
  );
}
