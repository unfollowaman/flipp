/**
 * Manually verified reference passages from the visible source PDF assets/test.pdf.
 * Used for evaluating Character Error Rate (CER) and Word Error Rate (WER).
 */

const REFERENCE_PASSAGES = [
  {
    id: 'page1_intro',
    pageNumber: 1,
    category: 'early_page_hindi_and_english',
    description: 'Page 1 Intro to Political Parties',
    startKeyword: 'लोकतांत्रिक यात्रा का संदर्भ',
    endKeyword: 'किया जाएगा',
    text: `लोकतांत्रिक यात्रा का संदर्भ: कक्षा 9 और 10 के पिछले अध्यायों में यह स्पष्ट किया गया है कि लोकतांत्रिक शासन व्यवस्था को बनाने, संविधान की रचना करने, चुनावी राजनीति तथा सरकार के गठन और संचालन में राजनीतिक दलों (Political Parties) की केंद्रीय भूमिका होती है। + सत्ता के बंटवारे के वाहक: राजनीतिक दल लोकतांत्रिक व्यवस्था में सत्ता के बंटवारे के मुख्य माध्यम होते हैं तथा सामाजिक समूहों की ओर से राजनीतिक मोल-तोल करते हैं। + अध्याय का उद्देश्य: इस अध्याय में राजनीतिक दलों की प्रकृति, उनके कार्य, दलीय व्यवस्थाओं के प्रकार, भारत के राष्ट्रीय एवं क्षेत्रीय दलों, राजनीतिक दलों की कमियों (चुनौतियों) तथा उन्हें दूर करने के सुधार उपायों का विस्तृत अध्ययन किया जाएगा।`,
  },
  {
    id: 'page2_components',
    pageNumber: 2,
    category: 'early_middle_page_structure',
    description: 'Page 2 Components of a Political Party',
    startKeyword: 'तीन प्रमुख हिस्से',
    endKeyword: 'उम्मीदवारों को मत',
    text: `2.2 राजनीतिक दल के तीन प्रमुख हिस्से नेता (Leaders): दल के शीर्ष पद संभालने वाले तथा नीतिगत फैसले लेने वाले प्रतिनिधि। + सक्रिय सदस्य (Active Members): पार्टी के सांगठनिक ढांचे में काम करने वाले और कार्यक्रमों को संचालित करने वाले कार्यकर्ता। + अनुयायी या समर्थक (Followers or Supporters): party की विचारधारा और उम्मीदवारों को मत`,
  },
  {
    id: 'page3_functions',
    pageNumber: 3,
    category: 'early_middle_functions',
    description: 'Page 3 Functions of Political Parties',
    startKeyword: '2.3 राजनीतिक',
    endKeyword: 'चुनाव राजनीतिक',
    text: `2.3 राजनीतिक दल के कार्य (Functions of Political Parties) राजनीतिक दल मूलतः राजनीतिक पदों को भरते हैं और राजनीतिक सत्ता का इस्तेमाल करते हैं। इसके प्रमुख कार्य निम्नलिखित हैं; 1. चुनाव लड़ना (Contesting Elections): अधिकांश लोकतांत्रिक देशों में चुनाव राजनीतिक`,
  },
  {
    id: 'page5_accountability',
    pageNumber: 5,
    category: 'middle_accountability',
    description: 'Page 5 Lack of Accountability heading and prose',
    startKeyword: 'उत्तरदायित्व की कमी',
    endKeyword: 'उत्तरदायित्व नहीं होगा',
    text: `उत्तरदायित्व की कमी (Lack of Accountability): निर्वाचित प्रतिनिधि केवल अपने निर्वाचन क्षेत्र (Constituency) के कार्यों के लिए जवाबदेह होंगे, लेकिन 'देश कैसे चले' इसके लिए कोई उत्तरदायित्व नहीं होगा`,
  },
  {
    id: 'page6_alliance',
    pageNumber: 6,
    category: 'middle_page_coalition',
    description: 'Page 6 Coalition & Alliance definitions',
    startKeyword: 'गठबंधन या मोर्चा',
    endKeyword: 'कम्युनिस्ट पार्टियों के नेतृत्व में',
    text: `3.2 गठबंधन या मोर्चा (Alliance or Front) + परिभाषा: जब बहुदलीय व्यवस्था में अनेक पार्टियाँ चुनाव लड़ने और सत्ता में आने के लिए आपस में हाथ मिला लेती हैं, तो इसे गठबंधन (Alliance) या मोर्चा (Front) कहा जाता है। + भारत में प्रमुख गठबंधन (2004 के संसदीय चुनाव के उदाहरण): 1. राष्ट्रीय जनतांत्रिक गठबंधन - राजग (National Democratic Alliance - NDA): भारतीय जनता पार्टी (BJP) के नेतृत्व में। 2. संयुक्त प्रगतिशील गठबंधन - संप्रग (United Progressive Alliance - UPA): भारतीय राष्ट्रीय कांग्रेस (INC) के नेतृत्व में। 3. वाम मोर्चा (Left Front): कम्युनिस्ट पार्टियों के नेतृत्व में।`,
  },
  {
    id: 'page8_recognized',
    pageNumber: 8,
    category: 'late_middle_recognized_parties',
    description: 'Page 8 Recognized Parties & Election Commission',
    startKeyword: 'मान्यता प्राप्त दल का अर्थ',
    endKeyword: 'विशेष चुनाव चिन्ह',
    text: `4.1 मान्यता प्राप्त दल का अर्थ (Recognized Parties) भारत में सभी राजनीतिक दलों को भारत निर्वाचन आयोग (Election Commission of India - ECI) में पंजीकरण कराना अनिवार्य है। बड़े और स्थापित दलों को आयोग विशेष सुविधाएं देता है, जैसे - विशेष चुनाव चिन्ह`,
  },
  {
    id: 'page11_inc_date',
    pageNumber: 11,
    category: 'late_middle_page_date_digits',
    description: 'Page 11 Indian National Congress & Year 1885',
    startKeyword: 'इंडियन नेशनल काँग्रेस',
    endKeyword: '3 सीटें प्राप्त की',
    text: `5. इंडियन नेशनल काँग्रेस - आईएनसी (Indian National Congress - INC) + गठन: 1885 में गठन (दुनिया के सबसे पुराने दलों में से एक)। + मूल सिद्धांत/विचारधारा: * मध्यमार्गी (Centrist) वैचारिक रुझान (न वामपंथी, न दक्षिणपंथी)। * जवाहरलाल नेहरू की अगुवाई में भारत को आधुनिक, धर्मनिरपेक्ष, लोकतांत्रिक गणराज्य बनाने का लक्ष्य। * धर्मनिरपेक्षता, कमजोर वर्गों और अल्पसंख्यक समुदायों का कल्याण; 'मानवीय चेहरे' के साथ नई आर्थिक नीतियों का समर्थन। + उपलब्धियाँ एवं उपस्थिति: * स्वतंत्रता के बाद दशकों तक (1977 तक लगातार), * 2004 से 2014 तक संयुक्त प्रगतिशील गठबंधन (UPA) सरकार का नेतृत्व। * 2019 लोकसभा चुनाव में 19.5% वोट और 52 सीटें प्राप्त की।`,
  },
  {
    id: 'page12_state_parties',
    pageNumber: 12,
    category: 'late_middle_state_parties',
    description: 'Page 12 State & Regional Parties',
    startKeyword: 'समाजलाढ़ी',
    endKeyword: 'कई राज्यों में हैं',
    text: `समाजवादी पार्टी (SP) और राष्ट्रीय जनता दल (RJD) का सांगठनिक ढाँचा राष्ट्रीय स्तर का है और उनकी इकाइयाँ कई राज्यों में हैं।`,
  },
  {
    id: 'page15_income_tax',
    pageNumber: 15,
    category: 'late_reforms',
    description: 'Page 15 Organizational Elections & Income Tax',
    startKeyword: 'आयकर रिदर्न',
    endKeyword: 'दाखिल करें',
    text: `चुनाव आयोग ने आदेश दिया है कि सभी राजनीतिक दल सांगठनिक चुनाव (Organizational Elections) कराएं और अपना आयकर रिटर्न (Income Tax Return) दाखिल करें।`,
  },
  {
    id: 'page16_timeline',
    pageNumber: 16,
    category: 'late_page_glossary_timeline',
    description: 'Page 16 Historical Timeline & Glossary',
    startKeyword: '7885 इंडियन',
    endKeyword: 'बहुजन समाज पार्टी',
    text: `1885 इंडियन नेशनल काँग्रेस (INC) की स्थापना। 1957 श्यामा Prasad Mukherjee द्वारा 'भारतीय जनसंघ' का गठन। 1964 कम्युनिस्ट पार्टी ऑफ इंडिया - मार्क्सवादी (CPI-M) की स्थापना। 1980 भारतीय जनसंघ को पुनर्जीवित कर 'भारतीय जनता पार्टी' (BJP) का गठन। 1984 कांशीराम के नेतृत्व में 'बहुजन समाज पार्टी'`,
  },
  {
    id: 'page17_glossary',
    pageNumber: 17,
    category: 'final_glossary',
    description: 'Page 17 Glossary Definitions',
    startKeyword: 'शासक ढ़ल',
    endKeyword: 'किसी दल',
    text: `शासक दल (Ruling Party): वह राजनीतिक दल जिसकी सरकार बनी हो या जो शासन चला रहा हो। विरोधी दल (Opposition Party): चुनाव में बहुमत प्राप्त न कर पाने वाले दल जो सरकार की नीतियों पर निगरानी और आलोचना करते हैं। दल-बदल (Defection): किसी विधायिका के लिए किसी दल`,
  }
];

module.exports = { REFERENCE_PASSAGES };
