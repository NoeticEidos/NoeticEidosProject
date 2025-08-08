module.exports = {
  // Formatting options
  semi: true,
  trailingComma: 'es5',
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  
  // TypeScript and JavaScript
  parser: 'typescript',
  
  // Bracket spacing
  bracketSpacing: true,
  bracketSameLine: false,
  
  // Arrow functions
  arrowParens: 'avoid',
  
  // End of line
  endOfLine: 'lf',
  
  // Embedded languages
  embeddedLanguageFormatting: 'auto',
  
  // HTML whitespace
  htmlWhitespaceSensitivity: 'css',
  
  // Quotes
  quoteProps: 'as-needed',
  
  // JSX (if needed in the future)
  jsxSingleQuote: true,
  
  // Override for specific file types
  overrides: [
    {
      files: '*.json',
      options: {
        parser: 'json',
        tabWidth: 2
      }
    },
    {
      files: '*.md',
      options: {
        parser: 'markdown',
        printWidth: 80,
        proseWrap: 'always'
      }
    },
    {
      files: '*.yaml',
      options: {
        parser: 'yaml',
        tabWidth: 2
      }
    },
    {
      files: '*.yml',
      options: {
        parser: 'yaml',
        tabWidth: 2
      }
    }
  ]
};