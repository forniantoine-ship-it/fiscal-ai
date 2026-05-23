import { HomeCta } from "@/components/marketing/HomeCta";
import { HomeDifferentiation } from "@/components/marketing/HomeDifferentiation";
import { HomeFaq } from "@/components/marketing/HomeFaq";
import { HomeHero } from "@/components/marketing/HomeHero";
import { HomeHowItWorks } from "@/components/marketing/HomeHowItWorks";
import { HomePricing } from "@/components/marketing/HomePricing";
import { HomeProductPreview } from "@/components/marketing/HomeProductPreview";
import { HomeTrust } from "@/components/marketing/HomeTrust";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <HomeHero />
        <HomeHowItWorks />
        <HomeProductPreview />
        <HomeDifferentiation />
        <HomePricing />
        <HomeFaq />
        <HomeTrust />
        <HomeCta />
      </main>
      <SiteFooter />
    </>
  );
}
