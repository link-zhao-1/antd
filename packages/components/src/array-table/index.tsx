import { ArrayField, FieldDisplayTypes, GeneralField } from '@formily/core'
import { Schema } from '@formily/json-schema'
import {
  observer,
  ReactFC,
  RecursionField,
  useField,
  useFieldSchema,
} from '@formily/react'
import { isArr, isBool, isFn } from '@formily/shared'
import {
  Badge,
  Pagination,
  PaginationProps,
  Select,
  SelectProps,
  Space,
  Table,
  TableProps,
} from 'antd'
import { ColumnProps, ColumnsType } from 'antd/es/table'
import cls from 'classnames'
import React, {
  createContext,
  forwardRef,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { ArrayBase, ArrayBaseMixins } from '../array-base'
import {
  ISortableContainerProps,
  SortableContainer,
  SortableElement,
  usePrefixCls,
} from '../__builtins__'
import useStyle from './style'

interface ObservableColumnSource {
  field?: GeneralField
  columnProps: ColumnProps<any>
  schema: Schema
  display: FieldDisplayTypes
  name: string
}
interface IArrayTablePaginationProps extends PaginationProps {
  dataSource?: any[]
  showPagination: boolean
  children?: (
    dataSource: any[],
    pagination: React.ReactNode,
    options: {
      startIndex: number
    }
  ) => React.ReactElement
}

interface IStatusSelectProps extends SelectProps<any> {
  pageSize?: number
}

interface PaginationAction {
  totalPage?: number
  pageSize?: number
  startIndex?: number
  changePage?: (page: number) => void
}

const SortableRow = SortableElement((props) => <tr {...props} />)

const SortableBodyRaw = SortableContainer<
  React.HTMLAttributes<HTMLTableSectionElement> & {
    tbodyRef: React.LegacyRef<HTMLTableSectionElement>
  }
>(({ tbodyRef, ...props }) => <tbody {...props} ref={tbodyRef} />)
const SortableBody = forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement> & ISortableContainerProps
>((props, ref) => <SortableBodyRaw {...props} tbodyRef={ref} />)

const isColumnComponent = (schema: Schema) => {
  return schema['x-component']?.indexOf('Column') > -1
}

const isOperationsComponent = (schema: Schema) => {
  return schema['x-component']?.indexOf('Operations') > -1
}

const isAdditionComponent = (schema: Schema) => {
  return schema['x-component']?.indexOf('Addition') > -1
}

const useArrayTableSources = () => {
  const arrayField = useField()
  const schema = useFieldSchema()
  const parseSources = (schema: Schema): ObservableColumnSource[] => {
    if (
      isColumnComponent(schema) ||
      isOperationsComponent(schema) ||
      isAdditionComponent(schema)
    ) {
      if (!schema['x-component-props']?.['dataIndex'] && !schema['name'])
        return []
      const name = schema['x-component-props']?.['dataIndex'] || schema['name']
      const field = arrayField.query(arrayField.address.concat(name)).take()
      const columnProps =
        field?.component?.[1] || schema['x-component-props'] || {}
      const display = field?.display || schema['x-display']
      return [
        {
          name,
          display,
          field,
          schema,
          columnProps,
        },
      ]
    } else if (schema.properties) {
      return schema.reduceProperties<
        ObservableColumnSource[],
        ObservableColumnSource[]
      >((buf, schema) => {
        return buf.concat(parseSources(schema))
      }, [])
    }
    return []
  }

  const parseArrayItems = (schema: Schema['items']) => {
    if (!schema) return []
    const sources: ObservableColumnSource[] = []
    const items = isArr(schema) ? schema : [schema]
    return items.reduce((columns, schema) => {
      const item = parseSources(schema)
      if (item) {
        return columns.concat(item)
      }
      return columns
    }, sources)
  }

  if (!schema) throw new Error('can not found schema object')

  return parseArrayItems(schema.items)
}
const indexKey = '__DO_NOT_USE_THIS_PROPERTY_index__'
const useArrayTableColumns = (
  dataSource: any[],
  field: ArrayField,
  sources: ObservableColumnSource[]
): ColumnsType<any> => {
  return sources.reduce<ColumnsType<any>>(
    (buf, { name, columnProps, schema, display }, key) => {
      if (display !== 'visible') return buf
      if (!isColumnComponent(schema)) return buf
      return buf.concat({
        ...columnProps,
        key,
        dataIndex: name,
        render: (value: any, record: any) => {
          const index = record[indexKey]

          const children = (
            <ArrayBase.Item index={index} record={() => field?.value?.[index]}>
              <RecursionField
                schema={schema}
                name={index}
                onlyRenderProperties
              />
            </ArrayBase.Item>
          )

          return index > -1 ? children : null
        },
      })
    },
    []
  )
}

const useAddition = () => {
  const schema = useFieldSchema()
  return schema.reduceProperties((addition, schema, key) => {
    if (isAdditionComponent(schema)) {
      return <RecursionField schema={schema} name={key} />
    }
    return addition
  }, null)
}

const schedulerRequest = {
  request: null as null | number,
}

const StatusSelect: ReactFC<IStatusSelectProps> = observer(
  (props) => {
    const field = useField<ArrayField>()
    const prefixCls = usePrefixCls('formily-array-table')
    const [wrapSSR, hashId] = useStyle(prefixCls)
    const errors = field.errors
    const parseIndex = (address?: string) => {
      return Number(
        address
          ?.slice(address.indexOf(field.address.toString()))
          .match(/(\d+)/)?.[1]
      )
    }
    const options = props.options?.map(({ label, value }) => {
      const val = Number(value)
      const hasError = errors.some(({ address }) => {
        const currentIndex = parseIndex(address)
        const startIndex = props.pageSize ? (val - 1) * props.pageSize : 0
        const endIndex = props.pageSize
          ? val * props.pageSize
          : props.options?.length || 0
        return currentIndex >= startIndex && currentIndex <= endIndex
      })
      return {
        label: hasError ? <Badge dot>{label}</Badge> : label,
        value,
      }
    })

    const width = String(options?.length).length * 15

    return wrapSSR(
      <Select
        value={props.value}
        onChange={props.onChange}
        options={options}
        virtual
        style={{
          width: width < 60 ? 60 : width,
        }}
        className={cls(`${prefixCls}-status-select`, hashId, {
          'has-error': errors?.length,
        })}
      />
    )
  },
  {
    scheduler: (update) => {
      clearTimeout(schedulerRequest.request as any)
      schedulerRequest.request = setTimeout(() => {
        update()
      }, 100) as unknown as number
    },
  }
)

const PaginationContext = createContext<PaginationAction>({})
const usePagination = () => {
  return useContext(PaginationContext)
}

const ArrayTablePagination: ReactFC<IArrayTablePaginationProps> = (props) => {
  const [current, setCurrent] = useState(1)
  const prefixCls = usePrefixCls('formily-array-table')
  const [wrapSSR, hashId] = useStyle(prefixCls)
  const [pageSize, setPageSize] = useState(props.pageSize || 10)
  const size = props.size || 'default'
  const dataSource = props.dataSource || []
  const showPagination = props.showPagination
  const startIndex = (current - 1) * pageSize
  const endIndex = startIndex + pageSize - 1
  const total = dataSource?.length || 0
  const totalPage = Math.ceil(total / pageSize)
  const pages = Array.from(new Array(totalPage)).map((_, index) => {
    const page = index + 1
    return {
      label: page,
      value: page,
    }
  })
  const handleChange = (current: number) => {
    setCurrent(current)
  }
  const handleSizeChange = (_, size: number) => {
    setPageSize(size)
  }

  useEffect(() => {
    setPageSize(props.pageSize || 10)
  }, [props.pageSize])

  useEffect(() => {
    if (totalPage > 0 && totalPage < current) {
      handleChange(totalPage)
    }
  }, [totalPage, current])

  const renderPagination = () => {
    if (!showPagination || totalPage < 1) return
    return (
      <div className={cls(`${prefixCls}-pagination`, hashId)}>
        <Space>
          <StatusSelect
            value={current}
            pageSize={pageSize}
            onChange={handleChange}
            options={pages}
            notFoundContent={false}
          />
          <Pagination
            {...props}
            pageSize={pageSize}
            current={current}
            total={dataSource.length}
            size={size}
            showSizeChanger={true}
            onShowSizeChange={handleSizeChange}
            onChange={handleChange}
          />
        </Space>
      </div>
    )
  }

  return wrapSSR(
    <Fragment>
      <PaginationContext.Provider
        value={{ totalPage, pageSize, startIndex, changePage: handleChange }}
      >
        {props.children?.(
          showPagination
            ? dataSource?.slice(startIndex, endIndex + 1)
            : dataSource,
          renderPagination(),
          {
            startIndex,
          }
        )}
      </PaginationContext.Provider>
    </Fragment>
  )
}

const WrapperComp = (props: React.HTMLAttributes<HTMLTableSectionElement>) => {
  const ref = useRef<HTMLTableSectionElement>(null)
  const field = useField<ArrayField>()
  const prefixCls = usePrefixCls('formily-array-table')
  const { startIndex } = useContext(PaginationContext)
  const dataSource = Array.isArray(field.value) ? field.value.slice() : []

  const addTdStyles = (id: number) => {
    const node = ref.current?.querySelector(`.${prefixCls}-row-${id}`)
    const helper = document.body.querySelector(`.${prefixCls}-sort-helper`)
    if (!helper) return
    const tds = node?.querySelectorAll('td')
    if (!tds) return
    requestAnimationFrame(() => {
      helper.querySelectorAll('td').forEach((td, index) => {
        if (tds[index]) {
          td.style.width = getComputedStyle(tds[index]).width
        }
      })
    })
  }

  return (
    <SortableBody
      ref={ref}
      {...props}
      start={startIndex}
      list={dataSource.slice()}
      accessibility={{
        container: ref.current || undefined,
      }}
      onSortStart={(event) => {
        addTdStyles(event.active.id as number)
      }}
      onSortEnd={({ oldIndex, newIndex }) => {
        field.move(oldIndex, newIndex)
      }}
      className={cls(`${prefixCls}-sort-helper`, props.className)}
    />
  )
}

const RowComp: ReactFC<React.HTMLAttributes<HTMLTableRowElement>> = (props) => {
  const prefixCls = usePrefixCls('formily-array-table')
  const index = props['data-row-key'] || 0
  return (
    <SortableRow
      lockAxis="y"
      {...props}
      index={index}
      className={cls(props.className, `${prefixCls}-row-${index + 1}`)}
    />
  )
}

const InternalArrayTable: ReactFC<TableProps<any>> = observer(
  (props: TableProps<any>) => {
    const ref = useRef<HTMLDivElement>(null)
    const field = useField<ArrayField>()
    const prefixCls = usePrefixCls('formily-array-table')
    const [wrapSSR, hashId] = useStyle(prefixCls)
    const dataSource = Array.isArray(field.value) ? field.value.slice() : []
    dataSource.forEach((item, index) => {
      item[indexKey] = index
    })
    const sources = useArrayTableSources()
    const columns = useArrayTableColumns(dataSource, field, sources)
    const pagination = isBool(props.pagination) ? {} : props.pagination
    const showPagination = isBool(props.pagination) ? props.pagination : true
    const addition = useAddition()
    const defaultRowKey = (record: any) => {
      return record[indexKey]
    }

    return wrapSSR(
      <ArrayTablePagination
        {...pagination}
        dataSource={dataSource}
        showPagination={showPagination}
      >
        {(dataSource, pager, { startIndex }) => {
          return (
            <div ref={ref} className={cls(prefixCls, hashId)}>
              <ArrayBase>
                <Table
                  size="small"
                  bordered
                  rowKey={defaultRowKey}
                  {...props}
                  onChange={() => {}}
                  pagination={false}
                  columns={columns}
                  dataSource={dataSource}
                  components={{
                    body: {
                      wrapper: WrapperComp,
                      row: RowComp,
                    },
                  }}
                />
                <div style={{ marginTop: 5, marginBottom: 5 }}>{pager}</div>
                {sources.map((column, key) => {
                  //专门用来承接对Column的状态管理
                  if (!isColumnComponent(column.schema)) return
                  return React.createElement(RecursionField, {
                    name: column.name,
                    schema: column.schema,
                    onlyRenderSelf: true,
                    key,
                  })
                })}
                {addition}
              </ArrayBase>
            </div>
          )
        }}
      </ArrayTablePagination>
    )
  }
)

const Column: ReactFC<ColumnProps<any>> = () => {
  return <Fragment />
}

const Addition: ArrayBaseMixins['Addition'] = (props) => {
  const array = ArrayBase.useArray()
  const { totalPage = 0, pageSize = 10, changePage } = usePagination()
  return (
    <ArrayBase.Addition
      {...props}
      onClick={(e) => {
        // 如果添加数据后将超过当前页，则自动切换到下一页
        const total = array?.field?.value.length || 0
        if (total === totalPage * pageSize + 1 && isFn(changePage)) {
          changePage(totalPage + 1)
        }
        props.onClick?.(e)
      }}
    />
  )
}

export const ArrayTable = Object.assign(ArrayBase.mixin(InternalArrayTable), {
  Column,
  Addition,
})

ArrayTable.displayName = 'ArrayTable'

export default ArrayTable
