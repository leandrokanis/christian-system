#!/bin/bash

# Nome do arquivo original
input_file="part_2.md"

# Array com os subtítulos
subtitles=(
    "Introduction"
    "1. Fact"
    "2. Testimony"
    "3. Faith"
    "4. Confirmation of the Testimony"
    "5. Fundamental Fact"
    "6. Purity of Speech"
)

# Loop pelos subtítulos para criar arquivos separados
for ((i=0; i<${#subtitles[@]}; i++)); do
    subtitle="${subtitles[i]}"
    # Nome do arquivo de saída
    output_file="${subtitle}.md"
    # Extrair o conteúdo entre subtítulos
    if [[ $i -lt $((${#subtitles[@]} - 1)) ]]; then
        start_subtitle="${subtitles[i]}"
        end_subtitle="${subtitles[i+1]}"
        awk -v start="$start_subtitle" -v end="$end_subtitle" '
            $0 ~ start {
                in_subtitle = 1
            }
            in_subtitle {
                if ($0 ~ end) {
                    in_subtitle = 0
                } else {
                    print > output_file
                }
            }
        ' output_file="$output_file" "$input_file"
    else
        start_subtitle="${subtitles[i]}"
        awk -v start="$start_subtitle" '
            $0 ~ start {
                in_subtitle = 1
            }
            in_subtitle {
                print > output_file
            }
        ' output_file="$output_file" "$input_file"
    fi
done
