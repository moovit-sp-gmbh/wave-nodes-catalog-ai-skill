import sentenceCaseNames from "./sentence-case-names.mjs";
import noTrailingPeriodDescription from "./no-trailing-period-description.mjs";
import exampleRequired from "./example-required.mjs";
import booleanDefaultRequired from "./boolean-default-required.mjs";
import curlOutputLast from "./curl-output-last.mjs";
import noClassSelfReference from "./no-class-self-reference.mjs";
import totalCountOutputName from "./total-count-output-name.mjs";

export default {
    meta: {
        name: "create-high5-nodes",
        version: "0.1.0",
    },
    rules: {
        "sentence-case-names": sentenceCaseNames,
        "no-trailing-period-description": noTrailingPeriodDescription,
        "example-required": exampleRequired,
        "boolean-default-required": booleanDefaultRequired,
        "curl-output-last": curlOutputLast,
        "no-class-self-reference": noClassSelfReference,
        "total-count-output-name": totalCountOutputName,
    },
};
