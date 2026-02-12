
import * as docx from 'docx';
import { getSteps, getReadinessLevelsDefinitions } from '../constants.tsx';
import { TEXT } from '../locales.ts';

const { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, VerticalAlign, ImageRun } = docx;

// Helper to handle multi-line text from textareas
const splitText = (text) => {
  if (!text) return [];
  return text.split('\n').flatMap((line, i, arr) => {
    const runs = [new TextRun(line)];
    if (i < arr.length - 1) {
      runs.push(new TextRun({ break: 1 }));
    }
    return runs;
  });
};

// Helper to convert Base64 string to Uint8Array for docx image support
const base64DataToUint8Array = (base64Data) => {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const H1 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } });
const H2 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 } });
const H3 = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } });
const P = (text) => new Paragraph({ children: splitText(text) });
const Bold = (text) => new TextRun({ text, bold: true });

const renderProblemNode = (node, title) => [
  H3(title),
  P(node.description),
];

const renderResultList = (items, title, prefix, indicatorLabel, descriptionLabel) => [
  H2(title),
  ...items.flatMap((item, index) => item.title ? [
    H3(`${prefix}${index + 1}: ${item.title}`),
    new Paragraph({ children: [Bold(`${descriptionLabel}: `), ...splitText(item.description)] }),
    new Paragraph({ children: [Bold(`${indicatorLabel}: `), new TextRun(item.indicator)] }),
  ] : []),
];

/**
 * Parses markdown-like text from Gemini summary and converts to Docx paragraphs.
 * Supports: # H1, ## H2, **Bold**, * Bullets
 */
const parseMarkdownToDocx = (text) => {
    const lines = text.split('\n');
    const elements = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Headers
        if (trimmed.startsWith('# ')) {
            elements.push(H1(trimmed.substring(2)));
            return;
        }
        if (trimmed.startsWith('## ')) {
            elements.push(H2(trimmed.substring(3)));
            return;
        }
        if (trimmed.startsWith('### ')) {
            elements.push(H3(trimmed.substring(4)));
            return;
        }

        // Bullets
        let isBullet = false;
        let content = trimmed;
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
            isBullet = true;
            content = trimmed.substring(2);
        }

        // Inline Bold Parsing (**text**)
        const parts = content.split(/(\*\*.*?\*\*)/g); // Split by bold markers
        const runs = parts.map(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return new TextRun({ text: part.slice(2, -2), bold: true });
            }
            return new TextRun({ text: part });
        });

        elements.push(new Paragraph({
            children: runs,
            bullet: isBullet ? { level: 0 } : undefined,
            spacing: { after: 120 } // Add slight spacing for readability
        }));
    });

    return elements;
};

export const generateSummaryDocx = async (summaryText, projectTitle, language = 'en') => {
    // Parse the markdown summary into styled paragraphs
    const parsedContent = parseMarkdownToDocx(summaryText);

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: {
                        font: "Calibri",
                        size: 22, // 11pt standard body text
                    },
                },
                heading1: {
                    run: {
                        font: "Calibri",
                        bold: true,
                        size: 32, // 16pt
                        color: "2E74B5", // Professional Blue
                    },
                    paragraph: {
                        spacing: { before: 240, after: 120 }
                    }
                },
                heading2: {
                    run: {
                        font: "Calibri",
                        bold: true,
                        size: 26, // 13pt
                        color: "2E74B5",
                    },
                    paragraph: {
                        spacing: { before: 240, after: 120 }
                    }
                },
                heading3: {
                    run: {
                        font: "Calibri",
                        bold: true,
                        size: 24, // 12pt
                        color: "1F4D78",
                    },
                },
                title: {
                    run: {
                        font: "Calibri",
                        bold: true,
                        size: 56, // 28pt
                        color: "2E74B5",
                    }
                }
            },
        },
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    text: projectTitle || 'Project Summary',
                    heading: HeadingLevel.TITLE,
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 400 }
                }),
                ...parsedContent
            ]
        }]
    });
    return Packer.toBlob(doc);
};


export const generateDocx = async (projectData, language = 'en', ganttData = null, pertData = null, organigramData = null) => {
  const { problemAnalysis, projectIdea, generalObjectives, specificObjectives, activities, outputs, outcomes, impacts, risks, kers, projectManagement } = projectData;
  const STEPS = getSteps(language);
  const t = TEXT[language];
  const READINESS_LEVELS_DEFINITIONS = getReadinessLevelsDefinitions(language);

  // Helper for traffic light coloring in Word
  const getRiskColor = (level) => {
      const l = level.toLowerCase();
      if (l === 'high') return "C00000"; // Red
      if (l === 'medium') return "FFC000"; // Orange/Yellow
      if (l === 'low') return "00B050"; // Green
      return "000000";
  };

  const children: (docx.Paragraph | docx.Table)[] = [
    new Paragraph({
      text: projectIdea.projectTitle || 'Project Proposal',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: projectIdea.projectAcronym ? `(${projectIdea.projectAcronym})` : '',
      heading: HeadingLevel.HEADING_1,
      style: "Title",
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 }
    }),
  ];

  // 1. Problem Analysis
  children.push(H1(STEPS[0].title));
  children.push(H2(t.coreProblem));
  children.push(H3(problemAnalysis.coreProblem.title));
  children.push(P(problemAnalysis.coreProblem.description));
  children.push(H2(t.causes));
  problemAnalysis.causes.forEach((cause, i) => cause.title && children.push(...renderProblemNode(cause, `${t.causeTitle} #${i + 1}: ${cause.title}`)));
  children.push(H2(t.consequences));
  problemAnalysis.consequences.forEach((consequence, i) => consequence.title && children.push(...renderProblemNode(consequence, `${t.consequenceTitle} #${i + 1}: ${consequence.title}`)));

  // 2. Project Idea
  children.push(H1(STEPS[1].title));
  children.push(H2(t.mainAim));
  children.push(P(projectIdea.mainAim));
  children.push(H2(t.stateOfTheArt));
  children.push(P(projectIdea.stateOfTheArt));
  children.push(H2(t.proposedSolution));
  children.push(P(projectIdea.proposedSolution));
  
  // Readiness Levels
  children.push(H2(t.readinessLevels));
  Object.entries(projectIdea.readinessLevels).forEach(([key, value]) => {
      const valueTyped = value as { level: number | null, justification: string };
      const def = READINESS_LEVELS_DEFINITIONS[key];
      if (valueTyped.level !== null) {
          children.push(H3(def.name));
          const levelInfo = def.levels.find(l => l.level === valueTyped.level);
          children.push(new Paragraph({ children: [Bold(`Level ${valueTyped.level}: `), new TextRun(levelInfo?.title || '')] }));
          children.push(P(valueTyped.justification));
      }
  });

  // EU Policies
  children.push(H2(t.euPolicies));
  projectIdea.policies.forEach((policy) => policy.name && children.push(H3(policy.name), P(policy.description)));

  // 3 & 4. Objectives
  children.push(H1(STEPS[2].title));
  children.push(...renderResultList(generalObjectives, t.generalObjectives, 'GO', t.indicator, t.description));
  children.push(H1(STEPS[3].title));
  children.push(...renderResultList(specificObjectives, t.specificObjectives, 'SO', t.indicator, t.description));
  
  // 5. Activities (Includes Workplan, Gantt, PERT, Risks)
  children.push(H1(STEPS[4].title));
  
  // Project Management (Quality & Efficiency)
  // Simplified logic: Always print the Header if projectManagement object exists.
  if (projectManagement) {
      children.push(H2(t.management.title));
      
      if (projectManagement.description && projectManagement.description.trim() !== '') {
          children.push(P(projectManagement.description));
      }
      
      children.push(H3(t.management.organigram));
      
      // Embed Organigram Image if available
      if (organigramData && organigramData.dataUrl) {
          try {
              const imgWidth = 600; 
              const aspectRatio = organigramData.height / organigramData.width;
              const imgHeight = imgWidth * aspectRatio;
              const base64Data = organigramData.dataUrl.split(',')[1] || organigramData.dataUrl;
              const imageBuffer = base64DataToUint8Array(base64Data);

              children.push(new Paragraph({
                  children: [
                      new ImageRun({
                          data: imageBuffer,
                          transformation: {
                              width: imgWidth,
                              height: imgHeight,
                          },
                          type: "png",
                      }),
                  ],
              }));
          } catch (e) {
              console.warn("Could not embed Organigram image", e);
          }
      } else {
          // Fallback if image failed
          children.push(new Paragraph({ children: [new TextRun({ text: "[Organigram Image Missing / Not Captured]", italics: true, color: "FF0000" })] }));
      }
      
      // Add text structure as supplementary info
      const s = projectManagement.structure;
      if (s) {
          if (s.coordinator) children.push(new Paragraph({ text: `${t.management.roles.coordinator}: ${s.coordinator}`, bullet: { level: 0 } }));
          if (s.steeringCommittee) children.push(new Paragraph({ text: `${t.management.roles.steering}: ${s.steeringCommittee}`, bullet: { level: 0 } }));
          if (s.technical) children.push(new Paragraph({ text: `${t.management.roles.technical}: ${s.technical}`, bullet: { level: 0 } }));
          if (s.advisoryBoard) children.push(new Paragraph({ text: `${t.management.roles.advisory}: ${s.advisoryBoard}`, bullet: { level: 0 } }));
      }
  }

  // Workplan
  children.push(H2(t.subSteps.workplan));
  activities.forEach(wp => {
    if (!wp.title) return;
    children.push(H3(`${wp.id}: ${wp.title}`));
    
    // Tasks Table
    children.push(new Paragraph({ text: t.tasks, heading: HeadingLevel.HEADING_4, spacing: { before: 200, after: 100 } }));
    const taskRows = wp.tasks.map(task => new TableRow({
        children: [
            new TableCell({ children: [P(task.id)] }),
            new TableCell({ children: [P(task.title)] }),
            new TableCell({ children: [P(task.description)] }),
            new TableCell({ children: [P(task.startDate)] }),
            new TableCell({ children: [P(task.endDate)] }),
        ]
    }));
    children.push(new Table({
        rows: [
            new TableRow({
                children: [t.id, t.title, t.description, t.startDate, t.endDate].map(header => new TableCell({ children: [new Paragraph({ children: [Bold(header)] })], shading: { type: ShadingType.SOLID, color: 'f2f2f2' } })),
                tableHeader: true,
            }),
            ...taskRows
        ],
        width: { size: 100, type: WidthType.PERCENTAGE }
    }));

    // Milestones
    if(wp.milestones?.length > 0 && wp.milestones.some(m => m.description)) {
        children.push(new Paragraph({ text: t.milestones, heading: HeadingLevel.HEADING_4, spacing: { before: 200, after: 100 } }));
        wp.milestones.forEach(m => m.description && children.push(new Paragraph({ text: `${m.id}: ${m.description}`, bullet: { level: 0 } })));
    }
    
    // Deliverables
    if(wp.deliverables?.length > 0 && wp.deliverables.some(d => d.description)) {
        children.push(new Paragraph({ text: t.deliverables, heading: HeadingLevel.HEADING_4, spacing: { before: 200, after: 100 } }));
        wp.deliverables.forEach(d => d.description && children.push(new Paragraph({ text: `${d.id}: ${d.description} (${t.indicator}: ${d.indicator})`, bullet: { level: 0 } })));
    }
  });

  // Embed Gantt Chart Image if available
  children.push(H2(t.ganttChart));
  if (ganttData && ganttData.dataUrl) {
      try {
          const imgWidth = 600; 
          const aspectRatio = ganttData.height / ganttData.width;
          const imgHeight = imgWidth * aspectRatio;
          const base64Data = ganttData.dataUrl.split(',')[1] || ganttData.dataUrl;
          const imageBuffer = base64DataToUint8Array(base64Data);

          children.push(new Paragraph({
              children: [
                  new ImageRun({
                      data: imageBuffer,
                      transformation: {
                          width: imgWidth,
                          height: imgHeight,
                      },
                      type: "png",
                  }),
              ],
          }));
      } catch (e) {
          console.warn("Could not embed Gantt image", e);
      }
  } else {
      children.push(new Paragraph({ children: [new TextRun({ text: "[Gantt Chart Image Missing]", italics: true, color: "FF0000" })] }));
  }

  // Embed PERT Chart Image if available
  children.push(H2(t.pertChart));
  if (pertData && pertData.dataUrl) {
      try {
          const imgWidth = 600; 
          const aspectRatio = pertData.height / pertData.width;
          const imgHeight = imgWidth * aspectRatio;
          const base64Data = pertData.dataUrl.split(',')[1] || pertData.dataUrl;
          const imageBuffer = base64DataToUint8Array(base64Data);

          children.push(new Paragraph({
              children: [
                  new ImageRun({
                      data: imageBuffer,
                      transformation: {
                          width: imgWidth,
                          height: imgHeight,
                      },
                      type: "png",
                  }),
              ],
          }));
      } catch (e) {
          console.warn("Could not embed PERT image", e);
      }
  } else {
      children.push(new Paragraph({ children: [new TextRun({ text: "[PERT Chart Image Missing]", italics: true, color: "FF0000" })] }));
  }

  // Risks
  if (risks && risks.length > 0) {
      children.push(H2(t.subSteps.riskMitigation));
      risks.forEach((risk, i) => {
          if (!risk.description) return;
          // Format: RISK1: Title (Category)
          const categoryLabel = t.risks.categories[risk.category.toLowerCase()] || risk.category;
          children.push(H3(`${risk.id || `Risk ${i+1}`}: ${risk.title} (${categoryLabel})`));
          
          children.push(P(risk.description));
          
          children.push(new Paragraph({ 
              children: [
                  Bold(`${t.risks.likelihood}: `), 
                  new TextRun({ 
                      text: t.risks.levels[risk.likelihood.toLowerCase()] || risk.likelihood,
                      bold: true,
                      color: getRiskColor(risk.likelihood)
                  })
              ] 
          }));
          
          children.push(new Paragraph({ 
              children: [
                  Bold(`${t.risks.impact}: `), 
                  new TextRun({ 
                      text: t.risks.levels[risk.impact.toLowerCase()] || risk.impact,
                      bold: true,
                      color: getRiskColor(risk.impact)
                  })
              ] 
          }));
          
          children.push(new Paragraph({ children: [Bold(`${t.risks.mitigation}: `)] }));
          children.push(P(risk.mitigation));
      });
  }

  // 6. Expected Results
  children.push(H1(STEPS[5].title));
  children.push(...renderResultList(outputs, t.outputs, 'D', t.indicator, t.description));
  children.push(...renderResultList(outcomes, t.outcomes, 'R', t.indicator, t.description));
  children.push(...renderResultList(impacts, t.impacts, 'I', t.indicator, t.description));

  // KERs
  if (kers && kers.length > 0) {
      children.push(H2(t.kers.kerTitle)); 
      kers.forEach((ker, i) => {
          if (!ker.title) return;
          // Format: KER1: Title
          children.push(H3(`${ker.id || `KER${i+1}`}: ${ker.title}`));
          children.push(new Paragraph({ children: [Bold(`${t.description}: `), ...splitText(ker.description)] }));
          children.push(new Paragraph({ children: [Bold(`${t.kers.exploitationStrategy}: `), ...splitText(ker.exploitationStrategy)] }));
      });
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
            size: 22, // 11pt
          },
        },
        heading1: {
            run: {
                font: "Calibri",
                bold: true,
                size: 32, // 16pt
                color: "2E74B5",
            },
        },
        heading2: {
            run: {
                font: "Calibri",
                bold: true,
                size: 26, // 13pt
                color: "2E74B5",
            },
        },
        heading3: {
            run: {
                font: "Calibri",
                bold: true,
                size: 24, // 12pt
                color: "1F4D78",
            },
        },
        heading4: {
             run: {
                font: "Calibri",
                bold: true,
                size: 22,
                color: "444444",
                italics: true
            }
        },
        title: {
            run: {
                font: "Calibri",
                bold: true,
                size: 56, // 28pt
                color: "2E74B5",
            }
        }
      },
    },
    sections: [{
      properties: {},
      children,
    }],
  });

  return Packer.toBlob(doc);
};
