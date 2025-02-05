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
        "model": "openai/gpt-4o-mini",
        "messages": [
          {
            "role": "system",
            "content": "Você é um assistente especializado em análise linguística de textos do século XIX, focado em identificar dificuldades de tradução."
          },
          {
            "role": "system",
            "content": "Sua tarefa é analisar um texto em inglês de 1839 e identificar palavras arcaicas, expressões idiomáticas e referências culturais que possam ser problemáticas na tradução para o português moderno."
          },
          {
            "role": "system",
            "content": "Extraia APENAS termos que estejam PRESENTES no texto fornecido. NÃO invente ou adicione palavras que não aparecem no texto."
          },
          {
            "role": "system",
            "content": "Para cada termo identificado, forneça uma breve explicação de seu significado em inglês e, quando possível, uma sugestão de equivalência em inglês moderno."
          },
          {
            "role": "system",
            "content": "O resultado deve ser um JSON puro com uma lista de objetos, cada um contendo:\n\n- 'term': o termo exato como aparece no texto fornecido\n- 'explanation': explicação breve em inglês sobre o termo\n- 'modern_equivalent': possível equivalência moderna (ou null, se não houver uma clara)"
          },
          {
            "role": "system",
            "content": "Se nenhum termo problemático for encontrado, retorne um JSON vazio: `[]`."
          },
          {
            "role": "system",
            "content": "Retorne APENAS o JSON puro, sem texto adicional, formatação markdown ou qualquer outro caractere especial."
          },
          {
            "role": "user",
            "content": "Por favor, identifique neste texto palavras arcaicas, expressões idiomáticas e referências culturais que possam ser problemáticas na tradução. Certifique-se de que cada termo esteja REALMENTE presente no texto fornecido:\n\n```text\n{fileContent}\n```"
          }
        ]
      }
      ,
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

    console.log('Glossário concluído com sucesso');
    console.log(response.data.choices[0].message.content);
    return response.data.choices[0].message.content;
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
      newTerms = JSON.parse(newGlossaryString);
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

// Executa com base nos argumentos da linha de comando
if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Por favor, forneça o caminho do arquivo a ser traduzido');
    process.exit(1);
  }
  processFile(filePath);
}

module.exports = { createGlossary, processFile };
