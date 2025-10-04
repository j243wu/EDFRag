/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // enables `next export` for static hosting
  images: { unoptimized: true },
};
export default nextConfig;
