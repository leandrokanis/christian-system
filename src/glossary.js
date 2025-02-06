const axios = require('axios');
require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;

const MODEL = "openai/gpt-4o-mini";

async function createGlossary(fileContent) {
  try {
    console.log('Criando glossário...');
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        "model": "openai/gpt-4o",
        "messages": [
          {
            "role": "system",
            "content": "Você é um assistente especializado em análise linguística de textos do século XIX, focado em identificar palavras arcaicas, expressões idiomáticas e referências culturais que possam ser problemáticas na tradução."
          },
          {
            "role": "system",
            "content": "Expressões ou termos teológicos não são termos de glossário. Elas não devem ser incluídas no glossário."
          },
          {
            "role": "system",
            "content": "Sua tarefa é extrair termos diretamente do texto fornecido, sem inventar ou adicionar palavras que não estejam presentes nele."
          },
          {
            "role": "system",
            "content": "Para cada termo identificado, forneça:\n- 'term': o termo exato como aparece no texto.\n- 'explanation': uma breve explicação do significado.\n- 'modern_equivalent': um possível equivalente em inglês moderno (ou null, se não houver um claro)."
          },
          {
            "role": "system",
            "content": "Responda apenas com um JSON contendo uma lista de termos encontrados. Se nenhum termo relevante for identificado, retorne um JSON vazio: `[]`."
          },
          {
            "role": "user",
            "content": `Analise o seguinte texto e identifique palavras arcaicas, expressões idiomáticas e referências culturais que possam ser problemáticas na tradução:\n\n${fileContent}`
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Text Translator'
        }
      }
    );

    if (!response.data || !response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
      console.error('Resposta da API em formato inesperado:', JSON.stringify(response.data, null, 2));
      throw new Error('Resposta da API em formato inválido');
    }

    const rawContent = response.data.choices[0].message.content;

    // Remover a formatação de código da resposta
    const jsonString = rawContent.replace(/```json\n|\n```/g, '').trim();

    // Log do conteúdo antes do parse
    console.log('Conteúdo do glossário antes do parse:', jsonString);

    // Verifica se o conteúdo é vazio
    if (jsonString === '') {
      console.warn('Nenhum termo encontrado. Retornando um glossário vazio.');
      return [];
    }

    let parsedContent;
    try {
      // Tente fazer o parse do JSON
      parsedContent = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Erro ao fazer parse do glossário:', jsonString);
      throw parseError;
    }

    console.log('Glossário concluído com sucesso');
    return parsedContent;
  } catch (error) {
    if (error.response) {
      console.error('Erro da API:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    console.error('Erro ao criar glossário:', error.message);
    throw error;
  }
}

async function processFile(filePath) {
  try {
    console.log(`Iniciando processamento do arquivo: ${filePath}`);
    
    // Lê o arquivo original
    console.log('Lendo arquivo de entrada...');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    console.log(`Arquivo lido com sucesso: ${fileContent.length} caracteres`);
    
    // Gera o novo glossário
    console.log('Gerando novo glossário...');
    const newGlossaryString = await createGlossary(fileContent);
    console.log('Novo glossário gerado com sucesso');

    // Adiciona verificação e tratamento do JSON
    let newTerms;
    try {

      console.log('########################');
      console.log({newGlossaryString});
      console.log('########################');

      newTerms = newGlossaryString;
      if (!Array.isArray(newTerms)) {
        console.error('O glossário não é um array:', newGlossaryString);
        throw new Error('O formato do glossário é inválido - esperava um array');
      }
    } catch (parseError) {
      console.error('Erro ao fazer parse do glossário:', newGlossaryString);
      console.error('Erro detalhado:', parseError);
      throw parseError;
    }

    console.log(`Número de novos termos encontrados: ${newTerms.length}`);
    
    // Define o caminho do arquivo de glossário
    const glossaryPath = 'glossary.json';
    console.log(`Caminho do arquivo de glossário: ${glossaryPath}`);
    
    // Verifica se o arquivo de glossário já existe
    let existingGlossary = [];
    try {
      console.log('Verificando glossário existente...');
      const existingContent = await fs.readFile(glossaryPath, 'utf-8');
      existingGlossary = JSON.parse(existingContent);
      console.log(`Glossário existente encontrado com ${existingGlossary.length} termos`);
    } catch (error) {
      console.log('Nenhum glossário existente encontrado, iniciando novo glossário');
    }

    // Combina o glossário existente com os novos termos
    console.log('Processando novos termos...');
    const combinedGlossary = [...existingGlossary];

    // Adiciona apenas termos que ainda não existem no glossário
    let termosAdicionados = 0;
    for (const newTerm of newTerms) {
      const termExists = combinedGlossary.some(
        existing => existing.term.toLowerCase() === newTerm.term.toLowerCase()
      );
      if (!termExists) {
        combinedGlossary.push(newTerm);
        termosAdicionados++;
      }
    }
    console.log(`${termosAdicionados} novos termos adicionados ao glossário`);
    
    // Salva o glossário combinado
    console.log('Salvando glossário atualizado...');
    await fs.writeFile(glossaryPath, JSON.stringify(combinedGlossary, null, 2));
    console.log(`Glossário atualizado com sucesso. Total de termos: ${combinedGlossary.length}`);
    
  } catch (error) {
    console.error('Erro ao processar arquivo:', error);
    console.error('Detalhes do erro:', error.stack);
  }
}

async function processDirectory(dirPath) {
  try {
    console.log(`Processando diretório: ${dirPath}`);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Processa recursivamente os subdiretórios
        await processDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Processa apenas arquivos .txt
        console.log(`\nProcessando arquivo: ${fullPath}`);
        await processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Erro ao processar diretório ${dirPath}:`, error);
  }
}

// Modifica a execução principal
if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Por favor, forneça o caminho do arquivo ou diretório a ser processado');
    process.exit(1);
  }

  (async () => {
    try {
      const stats = await fs.stat(inputPath);
      if (stats.isDirectory()) {
        await processDirectory(inputPath);
      } else {
        await processFile(inputPath);
      }
    } catch (error) {
      console.error('Erro ao processar entrada:', error);
      process.exit(1);
    }
  })();
}

module.exports = { createGlossary, processFile, processDirectory };
