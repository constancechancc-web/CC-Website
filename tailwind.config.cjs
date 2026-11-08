// Tailwind v3 defaults, same as the CDN build the site used before.
// Classes are read from index.html; run `npm run build-css` after changing any.
module.exports = {
  content: ["./index.html"],
  theme: {
    extend: {
      // One step larger than Tailwind's defaults for readability.
      fontSize: {
        xs: ['0.875rem', '1.25rem'],
        sm: ['1rem', '1.5rem'],
        base: ['1.125rem', '1.75rem'],
        lg: ['1.25rem', '1.75rem'],
        xl: ['1.375rem', '1.875rem'],
        '2xl': ['1.625rem', '2.125rem'],
        '3xl': ['2.125rem', '2.5rem'],
        '4xl': ['2.5rem', '2.75rem'],
        '5xl': ['3.375rem', '1'],
      },
    },
  },
  plugins: [],
};
