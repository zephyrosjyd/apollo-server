import { specifiedSDLRules } from 'graphql/validation/specifiedRules';
import {
  UniqueDirectivesPerLocation,
 } from 'graphql/validation/rules/UniqueDirectivesPerLocation';
import {
  UniqueEnumValueNames,
} from 'graphql/validation/rules/UniqueEnumValueNames';
import { UniqueTypeNames } from 'graphql/validation/rules/UniqueTypeNames';

import {
  UniqueTypeNamesWithFields,
  MatchingEnums,
  PossibleTypeExtensions,
  UniqueFieldDefinitionNames,
  UniqueUnionTypes,
} from './validate/sdl';

import {
} from './validate';

const omit = [
  UniqueDirectivesPerLocation,
  UniqueTypeNames,
  UniqueEnumValueNames,
  PossibleTypeExtensions,
  UniqueFieldDefinitionNames,
];

export const compositionRules = specifiedSDLRules
  .filter(rule => !omit.includes(rule))
  .concat([
    UniqueFieldDefinitionNames,
    UniqueTypeNamesWithFields,
    MatchingEnums,
    UniqueUnionTypes,
    PossibleTypeExtensions,
  ]);
