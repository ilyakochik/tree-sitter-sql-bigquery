/* eslint-disable no-unused-vars */

// 1Generate case insentitive match for SQL keyword
// In case of multiple word keyword provide a seq matcher
function kw(keyword) {
  if (keyword.toUpperCase() != keyword) {
    throw new Error(`Expected upper case keyword got ${keyword}`);
  }
  const words = keyword.split(" ");
  const regExps = words.map(createCaseInsensitiveRegex);

  if (regExps.length == 1) {
    return alias(regExps[0], keyword);
  } else {
    return alias(seq(...regExps), keyword.replace(/ /g, "_"));
  }
}

function createOrReplace(item) {
  if (item.toUpperCase() != item) {
    throw new Error(`Expected upper case item got ${item}`);
  }
  return alias(
    seq(
      createCaseInsensitiveRegex("CREATE"),
      field("replace", optional(createCaseInsensitiveRegex("OR REPLACE"))),
      createCaseInsensitiveRegex(item),
    ),
    `CREATE_OR_REPLACE_${item}`,
  );
}

function createCaseInsensitiveRegex(word) {
  return new RegExp(
    word
      .split("")
      .map((letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`)
      .join(""),
  );
}

function commaSep1(rule) {
  return sep1(rule, ",");
}

function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

function sep2(rule, separator) {
  return seq(rule, repeat1(seq(separator, rule)));
}

const unquoted_identifier = _ => /[_a-zA-Z][_a-zA-Z0-9]*/;
const quoted_identifier = _ => /`[a-zA-Z0-9.-_]+`/;

module.exports = grammar({
  name: "sql",
  extras: ($) => [
    /\s\n/,
    /\s/,
    $.comment,
    /[\s\f\uFEFF\u2060\u200B]|\\\r?\n/
  ],
  word: $ => $._unquoted_identifier,
  rules: {
    source_file: ($) => repeat($._statement),

    _statement: ($) =>
      seq(
        choice(
          $.select_statement,
          $.update_statement,
          $.set_statement,
          $.insert_statement,
          // $.create_type_statement,
          // $.create_domain_statement,
          // $.create_index_statement,
          $.create_table_statement,
          $.create_function_statement,
          $.create_schema_statement,
        ),
        optional(";"),
      ),

    create_function_statement: ($) =>
      seq(
        createOrReplace("FUNCTION"),
        $.identifier,
        $.create_function_parameters,
        kw("RETURNS"),
        $._create_function_return_type,
        repeat(
          choice(
            $._function_language,
            $.function_body,
            $.optimizer_hint,
            $.parallel_hint,
            $.null_hint,
          ),
        ),
      ),
    optimizer_hint: ($) =>
      choice(kw("VOLATILE"), kw("IMMUTABLE"), kw("STABLE")),
    parallel_hint: ($) =>
      choice(
        kw("PARALLEL"),
        choice(kw("SAFE"), kw("UNSAFE"), kw("RESTRICTED")),
      ),
    null_hint: ($) =>
      choice(
        kw("CALLED ON NULL INPUT"),
        kw("RETURNS NULL ON NULL INPUT"),
        kw("STRICT"),
      ),
    _function_language: ($) =>
      seq(kw("LANGUAGE"), alias($._unquoted_identifier, $.language)),
    _create_function_return_type: ($) =>
      choice($._type, $.setof, $.constrained_type),
    setof: ($) => seq(kw("SETOF"), choice($._type, $.constrained_type)),
    constrained_type: ($) => seq(seq($._type, $.null_constraint)),
    create_function_parameter: ($) =>
      seq(
        field(
          "argmode",
          optional(choice(kw("IN"), kw("OUT"), kw("INOUT"), kw("VARIADIC"))),
        ),
        optional($.identifier),
        choice($._type, $.constrained_type),
        optional(seq("=", alias($._expression, $.default))),
      ),
    create_function_parameters: ($) =>
      seq("(", commaSep1($.create_function_parameter), ")"),
    function_body: ($) =>
      seq(
        kw("AS"),
        choice(
          seq("$$", $.select_statement, optional(";"), "$$"),
          seq("'", $.select_statement, optional(";"), "'"),
        ),
      ),
    create_schema_statement: ($) =>
      seq(kw("CREATE SCHEMA"), optional(kw("IF NOT EXISTS")), $.identifier),
    set_statement: ($) =>
      seq(
        kw("SET"),
        field("scope", optional(choice(kw("SESSION"), kw("LOCAL")))),
        $.identifier,
        choice("=", kw("TO")),
        choice($._expression, kw("DEFAULT")),
      ),
    create_domain_statement: ($) =>
      seq(
        kw("CREATE DOMAIN"),
        $.identifier,
        optional(
          seq(
            kw("AS"),
            $._type,
            repeat(choice($.null_constraint, $.check_constraint)),
          ),
        ),
      ),
    create_type_statement: ($) =>
      seq(kw("CREATE TYPE"), $.identifier, kw("AS"), $.parameters),
    create_index_statement: ($) =>
      seq(
        kw("CREATE"),
        optional($.unique_constraint),
        kw("INDEX"),
        field("name", $.identifier),
        kw("ON"),
        field("table", $.identifier),
        optional($.using_clause),
        $.index_table_parameters,
        optional($.where_clause),
      ),
    create_table_column_parameter: ($) =>
      seq(
        field("name", $.identifier),
        field("type", $._type),
        repeat(
          choice(
            $.column_default,
            // $.check_constraint,
            // $.references_constraint,
            // $.unique_constraint,
            // $.null_constraint,
            // $.named_constraint,
            // $.direction_constraint,
            // $.auto_increment_constraint,
            // $.time_zone_constraint,
          ),
        ),
      ),
    auto_increment_constraint: (_) => kw("AUTO_INCREMENT"),
    direction_constraint: (_) => choice(kw("ASC"), kw("DESC")),
    named_constraint: ($) => seq("CONSTRAINT", $.identifier),
    column_default: ($) =>
      seq(
        kw("DEFAULT"),
        // TODO: this should be specific variable-free expression https://www.postgresql.org/docs/9.1/sql-createtable.html
        // TODO: simple expression to use for check and default
        choice(
          choice(
            $._parenthesized_expression,
            $.string,
            $.identifier,
            $.function_call,
          ),
          $.type_cast,
        ),
      ),
    create_table_parameters: ($) =>
      seq(
        "(",
        commaSep1(choice($.create_table_column_parameter)),
        ")",
      ),
    create_table_statement: ($) =>
      seq(
        kw("CREATE TABLE"),
        optional(kw("IF NOT EXISTS")),
        $.identifier,
        $.create_table_parameters,
      ),
    using_clause: ($) => seq(kw("USING"), field("type", $.identifier)),
    index_table_parameters: ($) =>
      seq("(", commaSep1(choice($._expression, $.ordered_expression)), ")"),

    // SELECT
    select_statement: ($) =>
      seq(
        optional($.cte_clause),
        $.select_clause,
        optional($.from_clause),
        optional(repeat($.join_clause)),
        optional($.where_clause),
        optional($.group_by_clause),
        optional($.having_clause),
        optional($.qualify_clause),
        optional($.order_by_clause),
        optional($.limit_clause),
      ),
    having_clause: ($) => seq(kw("HAVING"), $.boolean_expression),
    qualify_clause: ($) => seq(kw("QUALIFY"), $.boolean_expression),
    limit_clause: ($) => seq(kw("LIMIT"), $._integer, optional(seq(kw("OFFSET"), $._integer))),
    group_by_clause_body: ($) => commaSep1($._expression),
    group_by_clause: ($) => seq(
      kw("GROUP BY"),
      choice(
        $.group_by_clause_body
        , seq(kw("ROLLUP"), "(", $.group_by_clause_body, ")")
      )
    ),
    window_specification: ($) => seq(
      $.identifier,
      optional(kw("PARTITION BY")),
      optional($.order_by_clause)
    ),
    named_window_expression: ($) => seq(
      $.identifier, kw("AS"), 
      choice($.identifier, $.window_specification)
    ),
    window_clause: ($) => seq(kw("WINDOW"), $.named_window_expression),
    order_by_clause_body: ($) => commaSep1(seq($._expression, optional(choice(kw("ASC"), kw("DESC"))))),
    order_by_clause: ($) => seq(kw("ORDER BY"), $.order_by_clause_body),
    where_clause: ($) => seq(kw("WHERE"), $._expression),
    _aliased_expression: ($) =>
      seq($._expression, optional(kw("AS")), $.identifier),
    _aliasable_expression: ($) =>
      choice($._expression, alias($._aliased_expression, $.alias)),
    select_clause_body: ($) => prec.left(commaSep1($._aliasable_expression)),
    select_clause: ($) =>
      prec.left(seq(kw("SELECT"), optional($.select_clause_body))),
    cte_clause: ($) => seq(
        kw("WITH"),
        commaSep1(seq($.identifier, kw("AS"), $.select_clause_body)),
      ),
    from_clause: ($) => seq(kw("FROM"), commaSep1($._aliasable_expression)),
    join_type: ($) =>
      seq(
        choice(
          kw("INNER"),
          seq(
            choice(kw("LEFT"), kw("RIGHT"), kw("FULL")),
            optional(kw("OUTER")),
          ),
        ),
      ),
    join_clause: ($) =>
      seq(
        optional($.join_type),
        kw("JOIN"),
        $.identifier,
        kw("ON"),
        $._expression,
      ),
    select_subexpression: ($) => seq("(", $.select_statement, ")"),

    // UPDATE
    update_statement: ($) =>
      seq(kw("UPDATE"), $.identifier, $.set_clause, optional($.where_clause)),

    set_clause: ($) => seq(kw("SET"), $.set_clause_body),
    set_clause_body: ($) => seq(commaSep1($.assigment_expression)),
    assigment_expression: ($) => seq($.identifier, "=", $._expression),

    // INSERT
    insert_statement: ($) =>
      seq(kw("INSERT"), kw("INTO"), $.identifier, $.values_clause),
    values_clause: ($) => seq(kw("VALUES"), "(", $.values_clause_body, ")"),
    values_clause_body: ($) => commaSep1($._expression),
    in_expression: ($) =>
      prec.left(1, seq($._expression, optional(kw("NOT")), kw("IN"), $.tuple)),
    tuple: ($) =>
      seq(
        // TODO: maybe collapse with function arguments, but make sure to preserve clarity
        "(",
        field("elements", commaSep1($._expression)),
        ")",
      ),
    // TODO: named constraints
    references_constraint: ($) =>
      seq(
        kw("REFERENCES"),
        $.identifier,
        optional(seq("(", commaSep1($.identifier), ")")),
        // seems like a case for https://github.com/tree-sitter/tree-sitter/issues/130
        optional(
          choice(
            seq($.on_update_action, $.on_delete_action),
            seq($.on_delete_action, $.on_update_action),
          ),
        ),
      ),
    on_update_action: ($) =>
      seq(kw("ON UPDATE"), field("action", $._constraint_action)),
    on_delete_action: ($) =>
      seq(kw("ON DELETE"), field("action", $._constraint_action)),
    _constraint_action: ($) =>
      choice(kw("RESTRICT"), kw("CASCADE"), kw("SET NULL")),
    unique_constraint: ($) => kw("UNIQUE"),
    null_constraint: ($) => seq(optional(kw("NOT")), $.NULL),
    check_constraint: ($) => seq(kw("CHECK"), $._expression),
    _constraint: ($) =>
      seq(
        choice($.null_constraint, $.check_constraint),
        optional($.check_constraint),
      ),
    parameter: ($) => seq($.identifier, $._type),
    parameters: ($) => seq("(", commaSep1($.parameter), ")"),
    function_call: ($) =>
      seq(
        field("function", $.identifier),
        "(",
        optional(field("arguments", commaSep1($._expression))),
        ")",
      ),
    unnest_operator: $ => choice(
        seq(kw("UNNEST"), "(", $.array, ")"),
        seq(kw("UNNEST"), "(", $._identifier, ")"),
        seq(kw("UNNEST"), "(", $.function_call, ")"),
    ),
    unnest_clause: ($) => prec.right(50, seq(
      $.unnest_operator
      , optional(seq(kw("AS"), $.identifier))
      , optional($.unnest_withoffset)
    )),
    unnest_withoffset: $ => prec.left(2, seq(kw("WITH OFFSET"), optional(seq(kw("AS"), $._identifier)))),
    comparison_operator: ($) =>
      prec.left(
        6,
        seq(
          $._expression,
          field("operator", choice("<", "<=", "<>", "=", ">", ">=")),
          $._expression,
        ),
      ),
    _parenthesized_expression: ($) => prec(10, seq("(", $._expression, ")")),
    is_expression: ($) =>
      prec.left(
        1,
        seq(
          $._expression,
          kw("IS"),
          optional(kw("NOT")),
          choice($.NULL, $.TRUE, $.FALSE, $.distinct_from),
        ),
      ),
    distinct_from: ($) => prec.left(seq(kw("DISTINCT FROM"), $._expression)),
    boolean_expression: ($) =>
      choice(
        prec.left(5, seq(kw("NOT"), $._expression)),
        prec.left(4, seq($._expression, kw("AND"), $._expression)),
        prec.left(3, seq($._expression, kw("OR"), $._expression)),
      ),
    NULL: ($) => kw("NULL"),
    TRUE: ($) => kw("TRUE"),
    FALSE: ($) => kw("FALSE"),
    _integer: ($) => /\d+/,
    _float: ($) =>
      choice(
        /[+-]?\d+\.(\d*)([eE][+-]?\d+)?/,
        /(\d+)?\.\d+([eE][+-]?\d+)?/,
        /\d+[eE][+-]?\d+/,
      ),
    _float_or_integer: ($) =>
      choice(
        $._integer,
        $._float,
      ),
    numeric: ($) =>
      seq(
        choice(
          kw("NUMERIC"),
          kw("BIGNUMERIC"),
          kw("DECIMAL"),
          kw("BIGDECIMAL"),
        ),
        choice(
          seq("'", $._float_or_integer, "'"),
          seq('"', $._float_or_integer, '"'),
        ),
      ),
    _number: ($) =>
      choice(
        $._integer,
        $._float,
        $.numeric,
      ),
    time: ($) =>
      seq(
        choice(kw("DATE"), kw("TIME"), kw("DATETIME"), kw("TIMESTAMP")),
        $.string,
      ),
    number: ($) => $._number,
    query_parameter: ($) => /@+[_a-zA-Z][_a-zA-Z0-9]*/,
    _literal: ($) =>
      choice(
        $.query_parameter,
        $.array,
        $.struct,
        $.time,
        $.string,
        $.TRUE,
        $.FALSE,
        $.NULL,
        $._identifier,
        $.number,
      ),
    array: ($) =>
      seq(
        optional(seq(
          kw("ARRAY"),
          optional(seq("<", choice($._type_struct, $._unquoted_identifier), ">")),
        )),
        "[",
        optional(commaSep1($._literal)),
        "]",
      ),
    _type_struct: ($) => seq(
      kw("STRUCT"),
      optional(seq("<", commaSep1(
          seq(
            optional(/[a-zA-Z0-9]+/),
            choice(/[a-zA-Z0-9]+/, $._type_struct)
          )
        ), ">"))
    ),
    struct: ($) =>
      seq(
        optional($._type_struct),
        "(",
        commaSep1($._aliasable_expression),
        ")",
      ),
    _unquoted_identifier: unquoted_identifier,
    _quoted_identifier: quoted_identifier,
    _identifier: ($) => choice($._quoted_identifier, $._unquoted_identifier),
    _dotted_identifier: ($) => seq($._identifier, "."),
    identifier: ($) =>
      prec.left(1, seq(repeat($._dotted_identifier), $._identifier)),
    type: ($) => seq($.identifier, optional(seq("(", $.number, ")"))),
    string: ($) =>
      alias(
        choice(
          seq(/[bB]?[rR]?'/, field("content", /[^']*/), "'"),
          seq(/[bB]?[rR]?"/, field("content", /[^"]*/), '"'),
          seq(/[bB]?[rR]?'''/, field("content", /[^']+/), "'''"), // FIXME: single quote included multi-line text
          seq(/[bB]?[rR]?"""/, field("content", /[^"]+/), '"""'), // FIXME double quote included multi-line text
        ),
        "_string",
      ),
    field_access: ($) => seq($.identifier, "->>", $.string),
    ordered_expression: ($) =>
      seq($._expression, field("order", choice(kw("ASC"), kw("DESC")))),
    array_type: ($) => seq($._type, "[", "]"),
    _type: ($) => choice($.type, $.array_type),
    type_cast: ($) =>
      seq(
        // TODO: should be moved to basic expression or something
        choice(
          $._parenthesized_expression,
          $.string,
          $.identifier,
          $.function_call,
        ),
        "::",
        field("type", $._type),
      ),
    // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
    comment: ($) =>
      token(
        choice(seq("#", /.*/), seq("--", /.*/), seq("/*", /[^*]*\*+([^/*][^*]*\*+)*/, "/")),
      ),
    array_element_access: ($) =>
      seq(choice($.identifier, $.argument_reference), "[", $._expression, "]"),
    binary_expression: ($) =>
      prec.left(
        choice(
          seq($._expression, "~", $._expression),
          seq($._expression, "+", $._expression),
        ),
      ),
    asterisk_expression: ($) => seq(optional($._dotted_identifier), "*"),
    argument_reference: ($) => seq("$", /\d+/),
    _expression: ($) =>
      prec(
        10,
        choice(
          $.function_call,
          $.string,
          $.field_access,
          $._literal,
          $.asterisk_expression,
          $.identifier,
          $.comparison_operator,
          $.unnest_clause,
          $.in_expression,
          $.is_expression,
          $.boolean_expression,
          $._parenthesized_expression,
          $.type_cast,
          $.binary_expression,
          $.array_element_access,
          $.argument_reference,
          $.select_subexpression,
        ),
      ),
  },
});
