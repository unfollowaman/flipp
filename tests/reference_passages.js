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
    startKeyword: 'राजनीतिक ढल के तीन प्रमुख हिस्से',
    endKeyword: 'उम्मीदवारों को मत',
    text: `2.2 राजनीतिक दल के तीन प्रमुख हिस्से नेता (Leaders): दल के शीर्ष पद संभालने वाले तथा नीतिगत फैसले लेने वाले प्रतिनिधि। + सक्रिय सदस्य (Active Members): पार्टी के सांगठनिक ढांचे में काम करने वाले और कार्यक्रमों को संचालित करने वाले कार्यकर्ता। + अनुयायी या समर्थक (Followers or Supporters): पार्टी की विचारधारा और उम्मीदवारों को मत`,
  },
  {
    id: 'page6_alliance',
    pageNumber: 6,
    category: 'middle_page_coalition',
    description: 'Page 6 Coalition & Alliance definitions',
    startKeyword: 'गठबंधन या मोर्चा',
    endKeyword: 'कम्युनिस्ट पार्टियों के नेतृत्त में',
    text: `3.2 गठबंधन या मोर्चा (Alliance or Front) + परिभाषा: जब बहुदलीय व्यवस्था में अनेक पार्टियाँ चुनाव लड़ने और सत्ता में आने के लिए आपस में हाथ मिला लेती हैं, तो इसे गठबंधन (Alliance) या मोर्चा (Front) कहा जाता है। + भारत में प्रमुख गठबंधन (2004 के संसदीय चुनाव के उदाहरण): 1. राष्ट्रीय जनतांत्रिक गठबंधन - राजग (National Democratic Alliance - NDA): भारतीय जनता पार्टी (BJP) के नेतृत्व में। 2. संयुक्त प्रगतिशील गठबंधन - संप्रग (United Progressive Alliance - UPA): भारतीय राष्ट्रीय कांग्रेस (INC) के नेतृत्व में। 3. वाम मोर्चा (Left Front): कम्युनिस्ट पार्टियों के नेतृत्व में।`,
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
    id: 'page16_timeline',
    pageNumber: 16,
    category: 'late_page_glossary_timeline',
    description: 'Page 16 Historical Timeline & Glossary',
    startKeyword: 'इंडियन नेशनल काँग्रेस (५0) की स्थापना',
    endKeyword: 'बहुजन समाज पार्टी',
    text: `1885 इंडियन नेशनल काँग्रेस (INC) की स्थापना। 1957 श्यामा प्रसाद मुखर्जी द्वारा 'भारतीय जनसंघ' का गठन। 1964 कम्युनिस्ट पार्टी ऑफ इंडिया - मार्क्सवादी (CPI-M) की स्थापना। 1980 भारतीय जनसंघ को पुनर्जीवित कर 'भारतीय जनता पार्टी' (BJP) का गठन। 1984 कांशीराम के नेतृत्व में 'बहुजन समाज पार्टी'`,
  }
];

module.exports = { REFERENCE_PASSAGES };
