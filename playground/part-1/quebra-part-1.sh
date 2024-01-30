#!/bin/bash

# Nome do arquivo original
input_file="part_1.md"

# Array com os subtítulos
subtitles=(
    "10. Sacrifice for Sin"
    "11. The Attributes of a True Sin-Offering"
    "12. Christ: the Light of the World"
    "13: The Lordship of the Messiah"
    "14. Faith in Christ"
    "15. Repentance"
    "16. Baptism"
    "17. The Christian Confession of Faith"
    "18. Conversion and Regeneration"
    "19. Christians are Persons Pardoned, Justified, Sanctified, Adopted, and Saved."
    "20. The Gift of the Holy Spirit"
    "21. The Christian Hope"
    "22. The Doom of the Wicked"
    "23. Summary of the Christian System of Facts"
    "24. The Body of Christ"
    "25. The Christian Ministry"
    "26. The Christian Discipline"
    "27. Expediency"
    "28. Heresy"
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
